/**
 * 共通クイズエンジン
 * どのHTMLファイルから呼ばれても、渡された config に基づいて動作します。
 */
const app = (function() {
    
    // 状態管理
    let config = null; // init時にセットされる
    let currentLevel = 2;
    let currentMode = 'basic'; 
    let difficultyRates = { 1: 0.15, 2: 0.35, 3: 0.60 };

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
            currentMode = 'basic'; // 強制的にbasic扱い（または全列表示）にする
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
        // disableModeSelectionの場合は全カラムを表示
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

        // データ行生成
        const rate = difficultyRates[currentLevel];
        let tableRows = [];
        let totalBlanks = 0;
        let attempts = 0;

        do {
            tableRows = [];
            totalBlanks = 0;
            attempts++;

            config.allData.forEach((fullRowData, rIndex) => {
                let rowCells = [];
                let rowBlankCount = 0;

                for (let cIndex = 0; cIndex < colCount; cIndex++) {
                    const cellData = fullRowData[cIndex];
                    let isBlank = false;
                    
                    if (cellData !== "-") {
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

                // 詰み防止: 行すべてが空欄なら1つ開ける
                if (rowBlankCount === colCount && colCount > 0) {
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
        tableRows.forEach((rowCells, rIndex) => {
            const tr = document.createElement('tr');
            const rowHead = document.createElement('td');
            rowHead.classList.add('row-header');
            rowHead.textContent = config.rowHeaders[rIndex];
            tr.appendChild(rowHead);

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
            const r = input.dataset.r;
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

        if (correctCount === totalCount) {
            const msgArea = getEl('messageArea');
            msgArea.textContent = "🎉 Perfect!! 全問正解です！ 🎉";
            msgArea.className = 'msg-success';
            msgArea.style.display = 'block';
        }
    }

    // 公開メソッド
    return { init, setDifficulty, changeMode, resetQuiz, checkAnswers };
})();
