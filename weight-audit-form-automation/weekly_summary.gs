const CONFIG = {
  SHEET_NAME: 'log',
  RECIPIENT_EMAIL: 'incinerate_mtg@yahoo.co.jp',
  TIMEZONE: 'Asia/Tokyo',

  // 週次送信設定
  TRIGGER_WEEKDAY: 'MONDAY', // SUNDAY / MONDAY などに変更可
  TRIGGER_HOUR: 7, // 0-23

  // 月曜朝に送るなら 1、日曜夜に送るなら 0 が使いやすい
  SUMMARY_END_OFFSET_DAYS: 1,
  SUMMARY_RANGE_DAYS: 7,

  // 記録対象日が未入力のときだけタイムスタンプから補完する
  USE_SCRIPT_DATE_FALLBACK: true,

  // 深夜帯の入力は前日分であることが多いため、補完時だけ前日扱いにする
  FALLBACK_PREVIOUS_DAY_CUTOFF_HOUR: 2,

  // 補助列として不足分があれば右端に追加する
  DERIVED_HEADERS: ['date', '週番号', '予定外回数_数値', '飲酒日フラグ', '日タイプ集計キー']
};

const HEADER_ALIASES = {
  timestamp: ['timestamp', 'タイムスタンプ'],
  recordDateInput: ['記録対象日', '対象日', '日付'],
  date: ['date'],
  plan: ['元々の予定', '予定'],
  weight: ['体重', '体重kg', '体重キロ'],
  steps: ['歩数', 'ステップ'],
  calories: ['摂取カロリー', 'カロリー', '摂取kcal', 'kcal'],
  party: ['飲み会'],
  alcohol: ['酒', '飲酒'],
  extra: ['予定外回数', '予定外'],
  memo: ['メモ'],
  weekNo: ['週番号'],
  extraNum: ['予定外回数_数値'],
  alcoholFlag: ['飲酒日フラグ'],
  planKey: ['日タイプ集計キー']
};

/**
 * 初回セットアップ用:
 * date 列と補助列の見出し・値を整える。
 */
function initializeLogSheet() {
  try {
    const sheet = getLogSheet_();
    ensureHeaders_(sheet);
    backfillDerivedColumns_(sheet);
    Logger.log('initializeLogSheet completed.');
  } catch (error) {
    Logger.log(`initializeLogSheet error: ${error.stack || error}`);
    throw error;
  }
}

/**
 * 手動テスト送信用。
 */
function runWeeklySummaryManually() {
  try {
    sendWeeklySummary();
  } catch (error) {
    Logger.log(`runWeeklySummaryManually error: ${error.stack || error}`);
    throw error;
  }
}

/**
 * 週次トリガーをコードから作り直す。
 */
function createWeeklySummaryTrigger() {
  try {
    deleteExistingTriggers_('sendWeeklySummary');

    ScriptApp.newTrigger('sendWeeklySummary')
      .timeBased()
      .onWeekDay(getWeekdayEnum_(CONFIG.TRIGGER_WEEKDAY))
      .atHour(CONFIG.TRIGGER_HOUR)
      .create();

    Logger.log('Weekly trigger created.');
  } catch (error) {
    Logger.log(`createWeeklySummaryTrigger error: ${error.stack || error}`);
    throw error;
  }
}

/**
 * メイン処理。
 * 直近 7 日分を集計し、前 7 日分と比較してメール送信する。
 */
function sendWeeklySummary() {
  try {
    const sheet = getLogSheet_();
    ensureHeaders_(sheet);
    backfillDerivedColumns_(sheet);

    const reportRange = buildReportRange_(new Date());
    const previousRange = {
      start: shiftDate_(reportRange.start, -CONFIG.SUMMARY_RANGE_DAYS),
      end: shiftDate_(reportRange.end, -CONFIG.SUMMARY_RANGE_DAYS)
    };

    const records = readLogRecords_(sheet);
    const currentWeek = records.filter((record) => isDateInRange_(record.dateObj, reportRange.start, reportRange.end));
    const previousWeek = records.filter((record) => isDateInRange_(record.dateObj, previousRange.start, previousRange.end));

    const currentStats = buildStats_(currentWeek);
    const previousStats = buildStats_(previousWeek);

    const subject = `減量監査 週次サマリー ${formatDate_(reportRange.end)}`;
    const body = buildEmailBody_(reportRange, currentStats, previousStats);

    GmailApp.sendEmail(CONFIG.RECIPIENT_EMAIL, subject, body);
    Logger.log(`Weekly summary sent to ${CONFIG.RECIPIENT_EMAIL}`);
  } catch (error) {
    Logger.log(`sendWeeklySummary error: ${error.stack || error}`);
    throw error;
  }
}

/**
 * フォーム送信後に補助列を自動更新したい場合に使う。
 * 必須ではないが設定しておくと date 列などが常に最新になる。
 */
function onFormSubmit(e) {
  try {
    const sheet = getLogSheet_();
    ensureHeaders_(sheet);

    if (!e || !e.range) {
      backfillDerivedColumns_(sheet);
      return;
    }

    const row = e.range.getRow();
    if (row <= 1) return;

    fillDerivedColumnsForRow_(sheet, row);
  } catch (error) {
    Logger.log(`onFormSubmit error: ${error.stack || error}`);
  }
}

function getLogSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet "${CONFIG.SHEET_NAME}" not found.`);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existingSet = new Set(headers.map((header) => normalizeString_(header)).filter(Boolean));

  CONFIG.DERIVED_HEADERS.forEach((header) => {
    if (existingSet.has(header)) return;

    const nextColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextColumn).setValue(header);
  });
}

function backfillDerivedColumns_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  for (let row = 2; row <= lastRow; row += 1) {
    fillDerivedColumnsForRow_(sheet, row);
  }
}

function fillDerivedColumnsForRow_(sheet, row) {
  const columnMap = getColumnMap_(sheet);
  const lastColumn = sheet.getLastColumn();
  const rowValues = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
  const timestamp = getCellByKey_(rowValues, columnMap, 'timestamp');
  const recordDateInput = getCellByKey_(rowValues, columnMap, 'recordDateInput');
  const plan = getCellByKey_(rowValues, columnMap, 'plan');
  const alcohol = getCellByKey_(rowValues, columnMap, 'alcohol');
  const extra = getCellByKey_(rowValues, columnMap, 'extra');

  if (!timestamp && !recordDateInput && !plan && !alcohol && !extra) {
    return;
  }

  const existingDate = getCellByKey_(rowValues, columnMap, 'date');
  const derivedDate = resolveRecordDate_(recordDateInput, existingDate, timestamp);
  const weekNo = derivedDate ? getWeekNumber_(derivedDate) : '';
  const extraCount = parseExtraCount_(extra);
  const alcoholFlag = parseBinaryFlag_(alcohol);
  const planKey = plan || '';

  sheet.getRange(row, getRequiredColumn_(columnMap, 'date')).setValue(derivedDate || '');
  sheet.getRange(row, getRequiredColumn_(columnMap, 'weekNo')).setValue(weekNo);
  sheet.getRange(row, getRequiredColumn_(columnMap, 'extraNum')).setValue(extraCount);
  sheet.getRange(row, getRequiredColumn_(columnMap, 'alcoholFlag')).setValue(alcoholFlag);
  sheet.getRange(row, getRequiredColumn_(columnMap, 'planKey')).setValue(planKey);
}

function readLogRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const columnMap = getColumnMap_(sheet);
  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values
    .map((row, index) => parseRow_(row, index + 2, columnMap))
    .filter((record) => record !== null);
}

function parseRow_(row, rowNumber, columnMap) {
  const timestamp = getCellByKey_(row, columnMap, 'timestamp');
  const recordDateInput = getCellByKey_(row, columnMap, 'recordDateInput');
  const dateCell = getCellByKey_(row, columnMap, 'date');
  const plan = normalizeString_(getCellByKey_(row, columnMap, 'plan'));
  const weight = parseNumber_(getCellByKey_(row, columnMap, 'weight'));
  const steps = parseNumber_(getCellByKey_(row, columnMap, 'steps'));
  const calories = parseNumber_(getCellByKey_(row, columnMap, 'calories'));
  const partyFlag = parseBinaryFlag_(getCellByKey_(row, columnMap, 'party'));
  const alcoholFlag = parseBinaryFlag_(getCellByKey_(row, columnMap, 'alcohol'));
  const extraCount = parseExtraCount_(getCellByKey_(row, columnMap, 'extra'));
  const memo = normalizeString_(getCellByKey_(row, columnMap, 'memo'));

  if (!timestamp && !recordDateInput && !dateCell && !plan && weight === null && steps === null && calories === null && partyFlag === 0 && alcoholFlag === 0 && extraCount === 0 && !memo) {
    return null;
  }

  const dateObj = resolveRecordDate_(recordDateInput, dateCell, timestamp);
  if (!dateObj) {
    Logger.log(`Row ${rowNumber} skipped: invalid date.`);
    return null;
  }

  return {
    rowNumber,
    dateObj,
    plan: normalizePlan_(plan),
    weight,
    steps,
    calories,
    partyFlag,
    alcoholFlag,
    extraCount,
    memo
  };
}

function buildReportRange_(baseDate) {
  const end = toDateOnly_(shiftDate_(baseDate, -CONFIG.SUMMARY_END_OFFSET_DAYS));
  const start = shiftDate_(end, -(CONFIG.SUMMARY_RANGE_DAYS - 1));
  return { start, end };
}

function buildStats_(records) {
  const weights = records.map((r) => r.weight).filter((v) => v !== null);
  const steps = records.map((r) => r.steps).filter((v) => v !== null);
  const calories = records.map((r) => r.calories).filter((v) => v !== null);
  const recordsWithWeight = records.filter((r) => r.weight !== null);
  const totalExtra = records.reduce((sum, r) => sum + r.extraCount, 0);
  const extraHighDays = records.filter((r) => r.extraCount >= 2).length;
  const partyDays = records.filter((r) => r.partyFlag === 1).length;
  const alcoholDays = records.filter((r) => r.alcoholFlag === 1).length;

  const extraByPlan = {
    '在宅': 0,
    '外出': 0,
    '飲み会': 0
  };

  records.forEach((record) => {
    if (extraByPlan.hasOwnProperty(record.plan)) {
      extraByPlan[record.plan] += record.extraCount;
    }
  });

  return {
    recordCount: records.length,
    avgWeight: average_(weights),
    firstWeight: recordsWithWeight.length ? recordsWithWeight[0].weight : null,
    lastWeight: recordsWithWeight.length ? recordsWithWeight[recordsWithWeight.length - 1].weight : null,
    firstToLastWeightDiff: recordsWithWeight.length >= 2
      ? recordsWithWeight[recordsWithWeight.length - 1].weight - recordsWithWeight[0].weight
      : null,
    avgSteps: average_(steps),
    avgCalories: average_(calories),
    calorieInputDays: calories.length,
    partyDays,
    alcoholDays,
    totalExtra,
    extraHighDays,
    extraByPlan,
    dominantPlan: getDominantPlan_(extraByPlan)
  };
}

function buildEmailBody_(reportRange, currentStats, previousStats) {
  const avgWeightDiff = diffOrNull_(currentStats.avgWeight, previousStats.avgWeight);
  const comment = buildWeeklyComment_(currentStats, avgWeightDiff);

  return [
    `対象期間: ${formatDate_(reportRange.start)} ～ ${formatDate_(reportRange.end)}`,
    `平均体重: ${formatNumberOrDash_(currentStats.avgWeight, 1, 'kg')}`,
    `前週差: ${formatDiffOrDash_(avgWeightDiff, 1, 'kg')}`,
    `週頭→週末 体重差: ${formatWeightSpanOrDash_(currentStats.firstWeight, currentStats.lastWeight, currentStats.firstToLastWeightDiff)}`,
    `平均歩数: ${formatNumberOrDash_(currentStats.avgSteps, 0, '歩')}`,
    `平均摂取カロリー: ${formatNumberOrDash_(currentStats.avgCalories, 0, 'kcal')}（入力 ${currentStats.calorieInputDays}日）`,
    `飲み会日数: ${currentStats.partyDays}日`,
    `飲酒日数: ${currentStats.alcoholDays}日`,
    `予定外回数 合計: ${currentStats.totalExtra}回`,
    `予定外回数 2以上の日数: ${currentStats.extraHighDays}日`,
    `崩れやすい日タイプ: ${currentStats.dominantPlan}`,
    `コメント: ${comment}`
  ].join('\n');
}

function buildWeeklyComment_(stats, avgWeightDiff) {
  const dominantPlan = stats.dominantPlan;

  if (stats.recordCount === 0) {
    return '対象期間の入力がありません。まずは毎日 1 回の記録を優先してください。';
  }

  if (stats.totalExtra === 0 && avgWeightDiff !== null && avgWeightDiff < 0) {
    return '予定外回数が抑えられ、体重も前週比で減少しています。良い流れです。';
  }

  if (dominantPlan === '在宅' && stats.totalExtra >= 3) {
    return '在宅日に予定外摂取が集中しています。家での追加行動を先に潰す週です。';
  }

  if (dominantPlan === '飲み会' && stats.partyDays >= 1) {
    return '飲み会日に予定外回数が増えやすい週です。会食前後の立て直しを意識すると安定します。';
  }

  if (stats.alcoholDays >= 3 && stats.totalExtra <= 3) {
    return '飲酒日は多めですが、予定外回数は比較的抑えられています。';
  }

  if (stats.extraHighDays >= 2) {
    return '予定外回数が多い日が複数あります。通常日の立て直しを優先してください。';
  }

  if (avgWeightDiff !== null && avgWeightDiff < 0) {
    return '体重は前週比で減少しています。このまま予定外回数の安定化を続けましょう。';
  }

  return `${dominantPlan}で予定外回数がやや出やすい週です。次週は同じ場面の対策を固定化しましょう。`;
}

function getDominantPlan_(extraByPlan) {
  const entries = Object.entries(extraByPlan);
  let bestPlan = '該当なし';
  let bestValue = 0;

  entries.forEach(([plan, value]) => {
    if (value > bestValue) {
      bestPlan = plan;
      bestValue = value;
    }
  });

  return bestValue === 0 ? '該当なし' : bestPlan;
}

function getWeekdayEnum_(weekdayName) {
  const map = {
    SUNDAY: ScriptApp.WeekDay.SUNDAY,
    MONDAY: ScriptApp.WeekDay.MONDAY,
    TUESDAY: ScriptApp.WeekDay.TUESDAY,
    WEDNESDAY: ScriptApp.WeekDay.WEDNESDAY,
    THURSDAY: ScriptApp.WeekDay.THURSDAY,
    FRIDAY: ScriptApp.WeekDay.FRIDAY,
    SATURDAY: ScriptApp.WeekDay.SATURDAY
  };

  const weekdayEnum = map[weekdayName];
  if (!weekdayEnum) {
    throw new Error(`Invalid TRIGGER_WEEKDAY: ${weekdayName}`);
  }

  return weekdayEnum;
}

function deleteExistingTriggers_(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getColumnMap_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const normalizedToIndex = {};
  const looseToIndex = {};

  headers.forEach((header, index) => {
    const normalized = normalizeString_(header);
    const loose = normalizeHeaderText_(header);
    if (normalized) {
      normalizedToIndex[normalized] = index + 1;
    }
    if (loose) {
      looseToIndex[loose] = index + 1;
    }
  });

  return { headers, normalizedToIndex, looseToIndex };
}

function getRequiredColumn_(columnMap, key) {
  const aliases = HEADER_ALIASES[key] || [];

  for (let i = 0; i < aliases.length; i += 1) {
    const column = columnMap.normalizedToIndex[aliases[i]];
    if (column) return column;
  }

  for (let i = 0; i < aliases.length; i += 1) {
    const column = findLooseHeaderColumn_(columnMap, aliases[i]);
    if (column) return column;
  }

  throw new Error(`Required column not found for key: ${key}`);
}

function getCellByKey_(rowValues, columnMap, key) {
  const aliases = HEADER_ALIASES[key] || [];

  for (let i = 0; i < aliases.length; i += 1) {
    const column = columnMap.normalizedToIndex[aliases[i]];
    if (column) return rowValues[column - 1];
  }

  for (let i = 0; i < aliases.length; i += 1) {
    const column = findLooseHeaderColumn_(columnMap, aliases[i]);
    if (column) return rowValues[column - 1];
  }

  return '';
}

function findLooseHeaderColumn_(columnMap, alias) {
  const normalizedAlias = normalizeHeaderText_(alias);
  if (!normalizedAlias) return null;

  if (columnMap.looseToIndex[normalizedAlias]) {
    return columnMap.looseToIndex[normalizedAlias];
  }

  const candidates = Object.keys(columnMap.looseToIndex);
  for (let i = 0; i < candidates.length; i += 1) {
    const header = candidates[i];
    if (header.includes(normalizedAlias) || normalizedAlias.includes(header)) {
      return columnMap.looseToIndex[header];
    }
  }

  return null;
}

function toDateOnly_(value) {
  if (!value) return null;

  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftDate_(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

function isDateInRange_(date, start, end) {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function parseNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;

  const normalized = normalizeNumericString_(value);
  if (!normalized) return null;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseBinaryFlag_(value) {
  const normalized = normalizeNumericString_(value) || normalizeLooseString_(value);

  if (!normalized) return 0;

  const truthyValues = new Set([
    '1',
    'yes',
    'true',
    '参加',
    '飲んだ',
    'あり',
    '有',
    '有り'
  ].map((item) => normalizeLooseString_(item)));

  return truthyValues.has(normalized) ? 1 : 0;
}

function parseExtraCount_(value) {
  const normalized = normalizeNumericString_(value) || normalizeString_(value);

  if (!normalized) return 0;
  if (normalized === '3以上') return 3;
  if (normalized === '3+') return 3;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeString_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeNumericString_(value) {
  const raw = normalizeString_(value);
  if (!raw) return '';

  return raw
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[．。]/g, '.')
    .replace(/[，]/g, ',')
    .replace(/[ー−]/g, '-')
    .replace(/[^0-9+,\-.]/g, '')
    .replace(/,/g, '')
    .trim();
}

function normalizeLooseString_(value) {
  return normalizeString_(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeHeaderText_(value) {
  return normalizeString_(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[()（）_\-]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizePlan_(value) {
  const raw = normalizeString_(value);
  const loose = normalizeLooseString_(value);

  if (!raw) return '';
  if (raw === '在宅') return '在宅';
  if (raw === '飲み会') return '飲み会';
  if (raw === '外出' || raw === 'その他外出') return '外出';
  if (loose.includes('外出')) return '外出';

  return raw;
}

function average_(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function diffOrNull_(currentValue, previousValue) {
  if (currentValue === null || previousValue === null) return null;
  return currentValue - previousValue;
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function formatNumberOrDash_(value, digits, suffix) {
  if (value === null) return '-';
  return `${value.toFixed(digits)}${suffix}`;
}

function formatDiffOrDash_(value, digits, suffix) {
  if (value === null) return '-';

  const fixed = value.toFixed(digits);
  const withSign = value > 0 ? `+${fixed}` : fixed;
  return `${withSign}${suffix}`;
}

function formatWeightSpanOrDash_(firstWeight, lastWeight, diff) {
  if (firstWeight === null || lastWeight === null || diff === null) return '-';
  return `${firstWeight.toFixed(1)}kg → ${lastWeight.toFixed(1)}kg (${diff > 0 ? '+' : ''}${diff.toFixed(1)}kg)`;
}

function getWeekNumber_(date) {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - firstDay) / 86400000) + 1;
  return Math.ceil(dayOfYear / 7);
}

function resolveRecordDate_(recordDateInput, derivedDateCell, timestamp) {
  const explicitDate = toDateOnly_(recordDateInput);
  if (explicitDate) return explicitDate;

  const helperDate = toDateOnly_(derivedDateCell);
  if (helperDate) return helperDate;

  if (!CONFIG.USE_SCRIPT_DATE_FALLBACK) return null;
  return timestampToRecordDate_(timestamp);
}

function timestampToRecordDate_(timestamp) {
  if (!timestamp) return null;

  const date = timestamp instanceof Date ? new Date(timestamp) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  if (date.getHours() < CONFIG.FALLBACK_PREVIOUS_DAY_CUTOFF_HOUR) {
    date.setDate(date.getDate() - 1);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
