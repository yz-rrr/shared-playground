/**
 * 共通クイズエンジン
 * どのHTMLファイルから呼ばれても、渡された config に基づいて動作する。
 */
const app = (function() {
    
    // 状態管理
    let config = null; // init時にセットされる
    let currentLevel = 2;
    let currentMode = 'basic'; 
    let difficultyRates = { 1: 0.15, 2: 0.35, 3: 0.60 };

    // 表示行数の管理
    let currentRowCount = 0; // 0なら全件表示
    const STORAGE_KEY_PREFIX = 'quiz_last_rows_'; // ローカルストレージのキー接頭辞

    const getEl = (id) => document.getElementById(id);

    // 初期化関数：各ページ固有のデータをここで受け取る
    function init(userConfig) {
        config = userConfig;
        
        // タイトル設定
        const titleEl = getEl('pageTitle');
        if(titleEl) titleEl.textContent = config.title;

        // モード切替UIの制御 (configにmode設定がなければ隠す)
        const modeGroup = document.querySelector('.mode-group');
        if (config.disableModeSelection && modeGroup) {
            modeGroup.style.display = 'none';
            // モード選択が無効な場合、設定があればbasicColCountに従うか、なければ全表示
            currentMode = config.basicColCount ? 'basic' : 'full';
        }

        // --- 新機能: 行数制限のUI制御 ---
        const rowLimitGroup = document.querySelector('.row-limit-group');
        if (config.enableRowSelection) {
            // HTML側にUIがあれば表示、初期値を設定
            if (rowLimitGroup) {
                rowLimitGroup.style.display = 'flex';
            }
            currentRowCount = config.defaultRowCount || 20;
            updateRowCountUI();
        } else {
            // 無効な場合はUIを隠し、全件表示(0)にする
            if (rowLimitGroup) {
                rowLimitGroup.style.display = 'none';
            }
            currentRowCount = 0; 
        }

        resetQuiz();
    }

    function setDifficulty(level) {
        currentLevel = level;
        document.querySelectorAll('.level-btn').forEach((btn, index) => {
            if (index + 1 === level) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        resetQuiz();
    }

    function changeMode() {
        const radios = document.getElementsByName('mode');
        for (const radio of radios) {
            if (radio.checked) {
                currentMode = radio.value;
                break;
            }
        }
        resetQuiz();
    }

    // --- 問題数変更 ---
    function setRowCount(count) {
        currentRowCount = count;
        updateRowCountUI();
        resetQuiz();
    }

    function updateRowCountUI() {
        // ボタンの見た目制御（HTML構造に依存するため、classで判定）
        document.querySelectorAll('.row-count-btn').forEach(btn => {
            const val = parseInt(btn.dataset.count, 10);
            if (val === currentRowCount) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    /**
     * 表示すべき行データのインデックス配列を計算する
     * localStorageを使って「前回表示していない問題」を優先する
     */
    function selectRowIndices(totalDataLength) {
        // 行数制限がない、またはデータ総数が制限以下の場合はすべて返す
        if (currentRowCount === 0 || totalDataLength <= currentRowCount) {
            return [...Array(totalDataLength).keys()];
        }

        const v = currentRowCount;
        // config.id が未設定の場合はタイトルを使うが、基本はHTML側でid設定を推奨
        const storageKey = STORAGE_KEY_PREFIX + (config.id || config.title); 
        
        // 前回表示したインデックスを取得
        let lastShownIndices = [];
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) lastShownIndices = JSON.parse(saved);
        } catch (e) { 
            // プライベートモード等でアクセス拒否された場合はエラー無視（機能オフ）
            console.warn("Storage access limited:", e); 
        }

        const allIndices = [...Array(totalDataLength).keys()];
        
        // 「今表示していない問題」(Hidden) の特定
        const hiddenIndices = allIndices.filter(idx => !lastShownIndices.includes(idx));
        const h = hiddenIndices.length;

        let selectedIndices = [];

        // 要件ロジックの実装
        if (h === v) {
            // a. (h = v) 「今表示していない問題」をすべて表示
            selectedIndices = [...hiddenIndices];
        } else if (h < v) {
            // b. (h < v) 「今表示していない問題」全表示 + 「今表示している(前回表示した)」からランダム
            selectedIndices = [...hiddenIndices];
            const needed = v - h;
            // lastShownIndices からランダムに needed 個選ぶ
            const shuffledLast = [...lastShownIndices].sort(() => 0.5 - Math.random());
            selectedIndices = selectedIndices.concat(shuffledLast.slice(0, needed));
        } else {
            // c. (h > v) 「今表示していない問題」からランダムに v 個
            const shuffledHidden = [...hiddenIndices].sort(() => 0.5 - Math.random());
            selectedIndices = shuffledHidden.slice(0, v);
        }

        // 今回の表示内容を保存
        try {
            localStorage.setItem(storageKey, JSON.stringify(selectedIndices));
        } catch (e) {
            // 保存失敗時も処理は続行
        }

        // インデックス順にソートして返す（テーブルの見た目順序を維持するため）
        return selectedIndices.sort((a, b) => a - b);
    }

    function resetQuiz() {
        const msgArea = getEl('messageArea');
        msgArea.style.display = 'none';
        msgArea.className = '';
        msgArea.textContent = '';
        
        getEl('checkBtn').classList.remove('hidden');
        getEl('retryBtn').classList.add('hidden');

        const table = getEl('quizTable');
        table.textContent = ''; 

        // モードによる列数の決定
        let colCount;
        if (config.disableModeSelection) {
            colCount = config.allColHeaders.length;
        } else {
            colCount = (currentMode === 'basic' && config.basicColCount) 
                       ? config.basicColCount 
                       : config.allColHeaders.length;
        }
        
        // ヘッダー生成
        const thead = document.createElement('tr');
        thead.appendChild(document.createElement('th')); // 左上
        
        for (let i = 0; i < colCount; i++) {
            const th = document.createElement('th');
            th.textContent = config.allColHeaders[i];
            thead.appendChild(th);
        }
        table.appendChild(thead);

        // --- データ行の選定 ---
        // ここで選ばれた行だけを使ってテーブルを作る
        const targetIndices = selectRowIndices(config.allData.length);

        // データ行生成
        const rate = difficultyRates[currentLevel];
        let tableRows = [];
        let totalBlanks = 0;
        let attempts = 0;

        do {
            tableRows = [];
            totalBlanks = 0;
            attempts++;

            // 選ばれた行(targetIndices)だけを処理
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
                        r: rIndex, // 元データのインデックスを保持
                        c: cIndex
                    });
                }

                // 詰み防止: 行すべてが空欄なら1つ開ける
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

        // 描画
        tableRows.forEach((rowCells) => {
            // 行ヘッダー取得 (cell.r を使う)
            const originalRIndex = rowCells[0].r;

            const tr = document.createElement('tr');
            const rowHead = document.createElement('td');
            rowHead.classList.add('row-header');
            rowHead.textContent = config.rowHeaders[originalRIndex];
            tr.appendChild(rowHead);

            rowCells.forEach(cell => {
                const td = document.createElement('td');
                if (cell.text === "-") {
                    td.textContent = "-";
                } else if (cell.isBlank) {
                    const input = document.createElement('input');
                    input.type = "text";
                    input.dataset.r = cell.r; // 元データの位置
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

        // フォーカス
        const firstInput = table.querySelector('input[type="text"]');
        if (firstInput && window.innerWidth > 600) { 
            firstInput.focus(); 
        }
    }

    function checkAnswers() {
        const inputs = document.querySelectorAll('input[type="text"]');
        let correctCount = 0;
        let totalCount = inputs.length;

        if (totalCount === 0) return;

        inputs.forEach(input => {
            const r = input.dataset.r; // 元データのインデックス
            const c = input.dataset.c;
            const correctVal = config.allData[r][c];
            const userVal = input.value.trim();
            const parentTd = input.parentElement;

            input.disabled = true;

            if (userVal.toLowerCase() === correctVal.toLowerCase()) {
                parentTd.textContent = correctVal; 
                parentTd.classList.add('correct-cell');
                correctCount++;
            } else {
                parentTd.classList.add('incorrect-cell');
                const hint = document.createElement('div');
                hint.classList.add('answer-hint');
                hint.textContent = `(${correctVal})`;
                parentTd.appendChild(hint);
            }
        });

        getEl('checkBtn').classList.add('hidden');
        getEl('retryBtn').classList.remove('hidden');

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

    // 公開メソッド
    return { init, setDifficulty, changeMode, setRowCount, resetQuiz, checkAnswers };
})();
