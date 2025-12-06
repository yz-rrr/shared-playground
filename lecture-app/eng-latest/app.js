/**
 * 共通クイズエンジン
 * どのHTMLファイルから呼ばれても、渡された config に基づいて動作する。
 */
const app = (function() {
    
    // ============================================================
    // 1. 状態管理変数
    // ============================================================
    let config = null; // init時にセットされる設定オブジェクト
    let currentLevel = 2; // 現在の難易度 (1, 2, 3)
    let currentMode = 'basic'; // 現在のモード ('basic' or 'full')
    
    // 難易度ごとの穴埋め率設定
    let difficultyRates = { 1: 0.15, 2: 0.35, 3: 0.60 };

    // 表示行数の管理 (0 = 全件表示)
    let currentRowCount = 0; 
    const STORAGE_KEY_PREFIX = 'quiz_last_rows_'; // LocalStorageキーの接頭辞

    // ★追加: 現在表示している行インデックスを保持する変数
    // 「同じ問題でもう一回」の機能のために、今の問題番号を記憶しておく
    let currentRowIndices = [];

    // DOM要素取得のヘルパー
    const getEl = (id) => document.getElementById(id);

    // ============================================================
    // 2. 初期化と設定変更
    // ============================================================

    /**
     * アプリ初期化
     * 各HTMLページ固有の設定(config)を受け取り、画面を構築する
     */
    function init(userConfig) {
        config = userConfig;
        
        // ページタイトルの設定
        const titleEl = getEl('pageTitle');
        if(titleEl) titleEl.textContent = config.title;

        // モード切替UIの制御 (configで無効化されている場合は隠す)
        const modeGroup = document.querySelector('.mode-group');
        if (config.disableModeSelection && modeGroup) {
            modeGroup.style.display = 'none';
            // モード選択が無効な場合、設定があればbasicColCountに従うか、なければ全表示
            currentMode = config.basicColCount ? 'basic' : 'full';
        }

        // 行数制限UIの制御 (verbs.html などで使用)
        const rowLimitGroup = document.querySelector('.row-limit-group');
        if (config.enableRowSelection) {
            if (rowLimitGroup) rowLimitGroup.style.display = 'flex';
            currentRowCount = config.defaultRowCount || 20;
            updateRowCountUI();
        } else {
            if (rowLimitGroup) rowLimitGroup.style.display = 'none';
            currentRowCount = 0; 
        }

        // 最初は「新しい問題」としてクイズを開始
        resetQuiz(false);
    }

    /**
     * 難易度の変更
     */
    function setDifficulty(level) {
        currentLevel = level;
        
        // ボタンの見た目を更新
        document.querySelectorAll('.level-btn').forEach((btn, index) => {
            if (index + 1 === level) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // 難易度変更時は、今の単語セットを維持したまま穴埋め箇所を変える
        // (true = 同じ行データを使う)
        resetQuiz(true);
    }

    /**
     * モード（列数）の変更
     */
    function changeMode() {
        const radios = document.getElementsByName('mode');
        for (const radio of radios) {
            if (radio.checked) {
                currentMode = radio.value;
                break;
            }
        }
        // モード変更時も同じ単語セットを維持
        resetQuiz(true); 
    }

    /**
     * 出題数（行数）の変更
     */
    function setRowCount(count) {
        currentRowCount = count;
        updateRowCountUI();
        // 件数変更時は、新しく選び直す必要があるため false
        resetQuiz(false); 
    }

    /**
     * 出題数ボタンの見た目を更新
     */
    function updateRowCountUI() {
        document.querySelectorAll('.row-count-btn').forEach(btn => {
            const val = parseInt(btn.dataset.count, 10);
            if (val === currentRowCount) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    // ============================================================
    // 3. ロジックコア (出題範囲の決定)
    // ============================================================

    /**
     * 表示すべき行データのインデックス配列を計算する
     * localStorageを使って「前回表示していない問題」を優先するロジック
     */
    function selectRowIndices(totalDataLength) {
        // 行数制限なし(0) または データ総数が制限以下の場合は全件表示
        if (currentRowCount === 0 || totalDataLength <= currentRowCount) {
            return [...Array(totalDataLength).keys()];
        }

        const v = currentRowCount; // 表示したい数
        // IDが未設定の場合はタイトルを使う（キー被り防止のためHTML側でID設定推奨）
        const storageKey = STORAGE_KEY_PREFIX + (config.id || config.title); 
        
        // 前回表示したインデックスを取得
        let lastShownIndices = [];
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) lastShownIndices = JSON.parse(saved);
        } catch (e) { 
            // プライベートモード等でアクセス拒否された場合はエラーログだけ出して続行
            console.warn("Storage access limited:", e); 
        }

        const allIndices = [...Array(totalDataLength).keys()];
        
        // 「今表示していない問題」(Hidden) の特定
        const hiddenIndices = allIndices.filter(idx => !lastShownIndices.includes(idx));
        const h = hiddenIndices.length;

        let selectedIndices = [];

        // --- 優先表示ロジック ---
        if (h === v) {
            // ケースa: 未表示数がピッタリなら、それを全て表示
            selectedIndices = [...hiddenIndices];
        } else if (h < v) {
            // ケースb: 未表示数が足りない場合
            // まず未表示分を全部入れ、足りない分(needed)を既出問題からランダム補充
            selectedIndices = [...hiddenIndices];
            const needed = v - h;
            const shuffledLast = [...lastShownIndices].sort(() => 0.5 - Math.random());
            selectedIndices = selectedIndices.concat(shuffledLast.slice(0, needed));
        } else {
            // ケースc: 未表示数が多すぎる場合
            // 未表示分の中からランダムに v 個選ぶ
            const shuffledHidden = [...hiddenIndices].sort(() => 0.5 - Math.random());
            selectedIndices = shuffledHidden.slice(0, v);
        }

        // 今回の選択結果を保存
        try {
            localStorage.setItem(storageKey, JSON.stringify(selectedIndices));
        } catch (e) {}

        // インデックス順（元の辞書順など）にソートして返す
        return selectedIndices.sort((a, b) => a - b);
    }

    // ============================================================
    // 4. クイズ生成 (描画)
    // ============================================================

    /**
     * クイズをリセット・再描画する
     * @param {boolean} isRetrySame - trueなら現在の問題セットを維持、falseなら新しく選び直す
     */
    function resetQuiz(isRetrySame = false) {
        const msgArea = getEl('messageArea');
        msgArea.style.display = 'none';
        msgArea.className = '';
        msgArea.textContent = '';
        
        // --- ボタン表示のリセット（すべて隠す初期化） ---
        const checkBtn = getEl('checkBtn');
        if(checkBtn) checkBtn.classList.remove('hidden');
        
        // ★修正: 存在確認をしてから hidden を追加（エラー防止）
        // 既存の練習ページ用ボタン
        const retryBtn = getEl('retryBtn');
        if (retryBtn) retryBtn.classList.add('hidden');
        
        // 新しい拡張ページ用ボタン
        const retrySameBtn = getEl('retrySameBtn');
        if (retrySameBtn) retrySameBtn.classList.add('hidden');
        const nextBtn = getEl('nextBtn');
        if (nextBtn) nextBtn.classList.add('hidden');
        // ---------------------------------------

        const table = getEl('quizTable');
        table.textContent = ''; 

        // 表示する列数の決定
        let colCount;
        if (config.disableModeSelection) {
            colCount = config.allColHeaders.length;
        } else {
            colCount = (currentMode === 'basic' && config.basicColCount) 
                       ? config.basicColCount 
                       : config.allColHeaders.length;
        }
        
        // テーブルヘッダー生成
        const thead = document.createElement('tr');
        thead.appendChild(document.createElement('th')); // 左上の空セル
        for (let i = 0; i < colCount; i++) {
            const th = document.createElement('th');
            th.textContent = config.allColHeaders[i];
            thead.appendChild(th);
        }
        table.appendChild(thead);

        // --- データ行の選定 ---
        let targetIndices;
        
        // ★ロジック: 同じ問題を再利用するか、新しく選ぶか
        if (isRetrySame && currentRowIndices.length > 0) {
            // 同じ行インデックスを再利用（穴埋め位置だけランダムで変わる）
            targetIndices = currentRowIndices;
        } else {
            // 新しく選定（localStorage更新も走る）
            targetIndices = selectRowIndices(config.allData.length);
            currentRowIndices = targetIndices; // 次回のために記憶
        }

        const rate = difficultyRates[currentLevel];
        let tableRows = [];
        let totalBlanks = 0;
        let attempts = 0;

        // 穴埋め生成ループ（最低でも2箇所の穴ができるまで試行）
        do {
            tableRows = [];
            totalBlanks = 0;
            attempts++;

            targetIndices.forEach((rIndex) => {
                const fullRowData = config.allData[rIndex];

                let rowCells = [];
                let rowBlankCount = 0;
                let quizTargetCount = 0; 
                
                for (let cIndex = 0; cIndex < colCount; cIndex++) {
                    const cellData = fullRowData[cIndex];
                    let isBlank = false;
                    const isExcluded = config.noQuizColumns && config.noQuizColumns.includes(cIndex);

                    if (cellData !== "-" && !isExcluded) {
                        quizTargetCount++; 
                        if (Math.random() < rate) {
                            isBlank = true;
                            rowBlankCount++;
                            totalBlanks++;
                        }
                    }
                    rowCells.push({
                        text: cellData,
                        isBlank: isBlank,
                        r: rIndex,
                        c: cIndex
                    });
                }

                // 詰み防止: 行すべてが空欄になってしまったら1つ開ける
                if (rowBlankCount === quizTargetCount && quizTargetCount > 0) {
                     const blankIndices = rowCells
                        .map((cell, idx) => cell.isBlank ? idx : -1)
                        .filter(idx => idx !== -1);
                     if (blankIndices.length > 0) {
                         const rescueIndex = blankIndices[Math.floor(Math.random() * blankIndices.length)];
                         rowCells[rescueIndex].isBlank = false;
                         totalBlanks--; 
                     }
                }
                tableRows.push(rowCells);
            });
            
        } while (totalBlanks < 2 && attempts < 100);

        // HTML描画
        tableRows.forEach((rowCells) => {
            const originalRIndex = rowCells[0].r;
            const tr = document.createElement('tr');
            
            // 行ヘッダー
            const rowHead = document.createElement('td');
            rowHead.classList.add('row-header');
            rowHead.textContent = config.rowHeaders[originalRIndex];
            tr.appendChild(rowHead);

            // データセル
            rowCells.forEach(cell => {
                const td = document.createElement('td');
                if (cell.text === "-") {
                    td.textContent = "-";
                } else if (cell.isBlank) {
                    const input = document.createElement('input');
                    input.type = "text";
                    input.dataset.r = cell.r;
                    input.dataset.c = cell.c;
                    input.autocomplete = "off";
                    td.appendChild(input);
                } else {
                    td.textContent = cell.text;
                }
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });

        // 最初の入力欄にフォーカス（PCのみ）
        const firstInput = table.querySelector('input[type="text"]');
        if (firstInput && window.innerWidth > 600) { 
            firstInput.focus(); 
        }
    }

    // ============================================================
    // 5. 答え合わせ処理
    // ============================================================

    function checkAnswers() {
        const inputs = document.querySelectorAll('input[type="text"]');
        let correctCount = 0;
        let totalCount = inputs.length;

        if (totalCount === 0) return;

        inputs.forEach(input => {
            const r = input.dataset.r;
            const c = input.dataset.c;
            const correctVal = config.allData[r][c];
            const userVal = input.value.trim();
            const parentTd = input.parentElement;

            input.disabled = true;

            // 正誤判定（大文字小文字無視）
            // 1. 判定用ロジック: 「/」で区切って配列化し、どれか1つと一致すればOKとする
            const acceptableAnswers = correctVal.split('/').map(s => s.trim().toLowerCase());
            const userValLower = userVal.toLowerCase();

            // 2. 表示用フォーマット: 「/」の前後にスペースを入れて見やすくする
            // 例: "dreamed/dreamt" → "dreamed / dreamt"
            const displayVal = correctVal.split('/').join(' / ');

            // 3. 判定と表示
            if (acceptableAnswers.includes(userValLower)) {
                // 正解時: 見やすく整形した文字列で上書き
                parentTd.textContent = displayVal; 
                parentTd.classList.add('correct-cell');
                correctCount++;
            } else {
                // 不正解時
                parentTd.classList.add('incorrect-cell');
                // 正解を表示（こちらも見やすく整形）
                const hint = document.createElement('div');
                hint.classList.add('answer-hint');
                hint.textContent = `(${displayVal})`;
                parentTd.appendChild(hint);
            }
        });

        // 「答え合わせ」ボタンを隠す
        getEl('checkBtn').classList.add('hidden');
        
        // ★修正: ページ構成に応じて適切な「リトライボタン」を表示する
        const retrySameBtn = getEl('retrySameBtn');
        const nextBtn = getEl('nextBtn');

        if (retrySameBtn && nextBtn) {
            // verbs.html のように2つのボタンがある場合
            retrySameBtn.classList.remove('hidden');
            nextBtn.classList.remove('hidden');
        } else {
            // practice.html のように1つしかボタンがない場合
            const retryBtn = getEl('retryBtn');
            if (retryBtn) retryBtn.classList.remove('hidden');
        }

        // メッセージ表示
        if (correctCount >= (totalCount - 1)) {
            const msgArea = getEl('messageArea');
            if (correctCount === totalCount) {
                msgArea.textContent = "🎉 Perfect!! 全問正解です！ 🎉";
                msgArea.className = 'msg-success';
            } else if (totalCount >= 2 && correctCount === (totalCount - 1)) {
                msgArea.textContent = "惜しい！ あと1問です！";
                msgArea.className = 'msg-veryclose';
            }
            msgArea.style.display = 'block';
        }
    }

    // 外部に公開するメソッド
    return { init, setDifficulty, changeMode, setRowCount, resetQuiz, checkAnswers };
})();
