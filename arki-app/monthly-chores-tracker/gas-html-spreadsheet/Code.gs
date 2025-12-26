// シートIDは自動取得するのでそのままでOK
const SS = SpreadsheetApp.getActiveSpreadsheet();
const SH_ITEMS = SS.getSheetByName('items');
const SH_LOGS = SS.getSheetByName('logs');

// --- ウェブアプリとしての表示処理 ---
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('家事ログ Cloud')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

// --- フロントエンドから呼ばれる関数群 ---

// 1. データ全取得 (起動時に呼ばれる)
function getAllData() {
  const data = SH_ITEMS.getDataRange().getValues();
  // ヘッダー行(0行目)を除去してオブジェクト配列に変換
  if (data.length <= 1) return [];
  
  const items = [];
  // 1行目から最後までループ
  for (let i = 1; i < data.length; i++) {
    items.push({
      id: String(data[i][0]),
      name: data[i][1],
      period: Number(data[i][2]),
      color: data[i][3],
      lastDate: data[i][4] ? formatDate(data[i][4]) : "" // 日付型を文字列に変換
    });
  }
  return items;
}

// 2. ログ記録 & 最終実行日更新
function registerLogServer(name, dateStr) {
  // A. ログシートに追記
  SH_LOGS.appendRow([new Date(), dateStr, name]);
  
  // B. アイテムシートの最終実行日を更新
  // 既存アイテムを探す
  const textFinder = SH_ITEMS.getRange("B:B").createTextFinder(name).matchEntireCell(true);
  const found = textFinder.findNext();
  
  if (found) {
    // 既存があればその行のE列(lastDate)を更新
    const row = found.getRow();
    SH_ITEMS.getRange(row, 5).setValue(dateStr);
  } else {
    // 新規アイテムならitemsシートにも追加（デフォルト設定）
    const newId = Date.now().toString();
    SH_ITEMS.appendRow([newId, name, 30, '#9CA3AF', dateStr]);
  }
  return getAllData(); // 更新後の全データを返す
}

// 3. アイテム設定の保存（新規・編集）
function saveItemServer(itemObj) {
  const data = SH_ITEMS.getDataRange().getValues();
  let foundRow = -1;
  
  // IDで検索
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(itemObj.id)) {
      foundRow = i + 1; // 配列インデックス+1 = 行番号
      break;
    }
  }

  if (foundRow > 0) {
    // 更新
    SH_ITEMS.getRange(foundRow, 1, 1, 5).setValues([[
      itemObj.id, itemObj.name, itemObj.period, itemObj.color, itemObj.lastDate
    ]]);
  } else {
    // 新規
    SH_ITEMS.appendRow([
      itemObj.id, itemObj.name, itemObj.period, itemObj.color, itemObj.lastDate
    ]);
  }
  return getAllData();
}

// 4. アイテム削除
function deleteItemServer(id) {
  const data = SH_ITEMS.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      SH_ITEMS.deleteRow(i + 1);
      break;
    }
  }
  return getAllData();
}

// --- ユーティリティ ---
// スプレッドシートの日付オブジェクトを YYYY-MM-DD 文字列に変換
function formatDate(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === 'string') return dateObj; // 既に文字列ならそのまま
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}