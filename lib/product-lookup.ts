import type { MaintenanceTask } from "./types";
export type VerifiedSuggestion = Pick<MaintenanceTask, "name" | "kind" | "intervalDays" | "sourceKind" | "sourceUrl"> & { frequency: string; conditions: string };
export type ProductCandidate = { maker: string; name: string; modelNumber: string; categoryId: string; productUrl: string; manualUrl: string; discoveredManualUrl?: string; productLinkLabel?: string; manualLinkLabel?: string; verifiedAt: string; releaseYear?: number; releaseSourceUrl?: string; lookupNote?: string; suggestions: VerifiedSuggestion[] };

// Curated model-specific evidence. Future search providers must return candidates
// with citations for human verification; generated text never enters this catalog.
export const catalog: ProductCandidate[] = [{
  maker: "SHARP", name: "加湿空気清浄機", modelNumber: "KI-RX75", categoryId: "air-purifier",
  productUrl: "https://jp.sharp/kuusei/products/kirx75/",
  manualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx75_mn.pdf",
  discoveredManualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx75_mn.pdf",
  verifiedAt: "2026-10-01",
  suggestions: [{ name: "使い捨て加湿プレフィルター交換", kind: "交換", intervalDays: 30,
    frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式",
    sourceUrl: "https://jp.sharp/kuusei/products/kirx75/feature/maintenance/",
    conditions: "加湿空気清浄運転で1日2.5L使用した場合の目安。水質・使用環境によって早まることがあります。" }],
}, {
  maker: "SHARP", name: "加湿空気清浄機", modelNumber: "KI-RX100", categoryId: "air-purifier",
  productUrl: "https://jp.sharp/kuusei/products/kirx100/",
  manualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf",
  discoveredManualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf",
  verifiedAt: "2026-10-02",
  suggestions: [
    { name: "本体・後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=29",
      conditions: "取扱説明書29ページ。運転を停止して電源プラグを抜き、柔らかい布で拭きます。本体・後ろパネルは水洗いしないでください。" },
    { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=29",
      conditions: "取扱説明書29ページ。運転を停止して電源プラグを抜き、センサー部のほこりを掃除機で取り除きます。" },
    { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=30",
      conditions: "取扱説明書30ページ。運転を停止して電源プラグを抜き、水洗いします。汚れや臭いが気になる場合の洗剤・つけ置き手順は説明書を確認してください。" },
  ],
}];
// Shared manuals explicitly list both models on their covers. Do not infer siblings.
const humidifierManuals = [
  { models: ["HV-T55", "HV-T75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvt55_75.mn_.pdf" },
  { models: ["HV-R55", "HV-R75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvr55_75_mn.pdf" },
  { models: ["HV-S55", "HV-S75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvs55_s75_mn.pdf" },
  { models: ["HV-P55", "HV-P75"], url: "https://jp.sharp/support/humid_con/doc/hvp55-hvp75_mn.pdf" },
];
for (const { models, url } of humidifierManuals) {
  for (const modelNumber of models) {
    catalog.push({
      maker: "SHARP", name: "加熱気化式加湿器", modelNumber, categoryId: "humidifier",
      productUrl: "https://jp.sharp/support/humid_con/download.html", manualUrl: url,
      productLinkLabel: "公式説明書一覧", manualLinkLabel: "取扱説明書",
      verifiedAt: "2026-10-09",
      lookupNote: "この品番を掲載した公式説明書の14〜16ページで周期を確認済みです。水質・使用環境や汚れによって、目安より早くお手入れしてください。",
      suggestions: [
        { name: "エアフィルターの掃除", kind: "掃除", intervalDays: 14,
          frequency: "2週間に1回程度（予定計算は14日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=15`,
          conditions: "説明書15ページ。停止してファン停止後に電源プラグを抜き、ほこりを掃除機で取り除きます。汚れが目立つ場合の水洗い・乾燥方法は説明書で確認してください。" },
        { name: "加湿フィルター・給水トレー・トレーカバーの掃除", kind: "掃除", intervalDays: 14,
          frequency: "2週間に1回程度（予定計算は14日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=16`,
          conditions: "説明書16ページ。停止してファン停止後に電源プラグを抜き、取り外して水で洗います。加湿フィルターをブラシでこすらないでください。汚れ・においが残る場合の手順は説明書で確認してください。" },
        { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
          frequency: "1か月に1回程度（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=15`,
          conditions: "説明書15ページ。停止してファン停止後に電源プラグを抜き、柔らかい布で拭きます。本体は水洗いしないでください。" },
      ],
    });
  }
}
const washerManual = "https://panasonic.jp/p-db/contents/manualdl/1428456489512.pdf";
for (const modelNumber of ["NA-LX129CL", "NA-LX129CR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: washerManual, manualUrl: washerManual,
    productLinkLabel: "品番を確認できる公式説明書", manualLinkLabel: "取扱説明書",
    verifiedAt: "2026-10-09",
    lookupNote: "公式説明書の表紙に左右開き両品番が掲載されています。46ページの周期を確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（48ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerManual}#page=24`,
        conditions: "説明書の印刷46ページ（PDF24ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerManual}#page=24`,
        conditions: "説明書の印刷46〜47ページ（PDF24ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
    ],
  });
}

const washerDManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/671/523/000000002671523/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8-NA-LX129D-.pdf";
for (const modelNumber of ["NA-LX129DL", "NA-LX129DR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn240827-3", manualUrl: washerDManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2024, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn240827-3", verifiedAt: "2026-10-09",
    lookupNote: "2024年10月上旬発売の公式発表。D型公式説明書の表紙に左右開き両品番が掲載されています。46ページの周期を確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（48ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=24`,
        conditions: "説明書の印刷46ページ（PDF24ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=24`,
        conditions: "説明書の印刷46〜47ページ（PDF24ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=25`,
        conditions: "印刷49ページ（PDF25ページ）。運転終了後、先に脱水して槽の水を抜き、容器で残水を受けてからゴミを取ります。ブザーが鳴る場合や運転中は外さないでください。取り付けは説明書に従い確実に締め、サイン表示時は予定前でも確認してください。" },
    ],
  });
}

const washerEManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/642/443/000000003642443/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8_NA-LX129E.pdf";
const washerEGuide = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/642/461/000000003642461/%E3%81%94%E4%BD%BF%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89_NA-LX129E.pdf";
for (const modelNumber of ["NA-LX129EL", "NA-LX129ER"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn250819-2", manualUrl: washerEManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2025, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn250819-2", verifiedAt: "2026-10-09",
    lookupNote: "2025年10月上旬発売の公式発表。E型公式説明書の表紙に左右開き両品番が掲載されています。槽は印刷36〜37ページ（PDF19）、排水フィルターと自動投入は別冊ご使用ガイド5・7ページで確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（別冊7ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerEManual}#page=19`,
        conditions: "説明書の印刷36ページ（PDF19ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerEManual}#page=19`,
        conditions: "説明書の印刷36〜37ページ（PDF19ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerEGuide}#page=7`,
        conditions: "別冊ご使用ガイド7ページ。運転終了後、先に脱水して槽の水を抜き、容器で残水を受けてからゴミを取ります。ブザーが鳴る場合や運転中は外さないでください。取り付けは説明書に従い確実に締め、サイン表示時は予定前でも確認してください。" },
      { name: "自動投入タンク・経路のお手入れ", kind: "掃除", intervalDays: 90,
        frequency: "3か月ごと（予定計算は90日）・長期不使用や剤変更時", sourceKind: "取扱説明書", sourceUrl: `${washerEGuide}#page=5`,
        conditions: "別冊ご使用ガイド5〜6ページ。1か月以上使わなかったときや、洗剤の銘柄・選べるタンクの剤を変えるときも実施します。衣類を入れず、タンクを洗って自動投入お手入れを選びます。井戸水の場合のクエン酸や経路詰まり時の操作はガイドで確認してください。" },
    ],
  });
}

const washerFManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/498/732/000000004498732/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8_NA-LX129F.pdf";
const washerFGuide = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/498/753/000000004498753/%E3%81%94%E4%BD%BF%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89_NA-LX129F.pdf";
for (const modelNumber of ["NA-LX129FL", "NA-LX129FR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn260820-1", manualUrl: washerFManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2026, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn260820-1", verifiedAt: "2026-10-09",
    lookupNote: "2026年10月上旬発売の公式発表。F型説明書で左右開き両品番と槽のお手入れ（印刷36〜37／PDF19）を確認しました。別冊6ページの排水フィルター、7ページのサブフィルターも確認済みです。乾燥糸くずボックスは乾燥のたび・サイン時、円筒フィルターはゴミ付着やサイン・U04時に確認します。自動投入タンクは内部の汚れ・洗剤や選べるタンクの剤の種類変更時（別冊5ページ）。これらの条件を固定日数には換算しません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFManual}#page=19`,
        conditions: "説明書の印刷36ページ（PDF19ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerFManual}#page=19`,
        conditions: "説明書の印刷36〜37ページ（PDF19ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFGuide}#page=6`,
        conditions: "別冊ご使用ガイド6ページ。先に脱水して槽の水を抜き、タオルなどで残水を受け、残水が出ないことを確認して引き出します。ゴムパッキンがずれた場合は戻し、ガイドの取り付け方に従い確実に固定してください。運転中に外したり、外したまま運転しないでください。サイン時は予定前でも確認します。" },
      { name: "乾燥用サブフィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週に1回程度・サブフィルターお手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFGuide}#page=7`,
        conditions: "別冊ご使用ガイド7ページ。運転終了後、乾燥糸くずボックスを取り出してから、本体側とサブフィルターを絞ったタオルなどで拭きます。ガイドに従い差し込み、カチッと押して戻してください。サイン時は予定前でも確認します。運転中は取り出さず、フィルター網目を強く押さえないでください。" },
    ],
  });
}

// EE-DD35 and EE-DD50 are explicitly listed on the same manual cover.
const steamManual = "https://www.zojirushi.co.jp/toiawase/TR_PDF/EEDD.pdf";
for (const modelNumber of ["EE-DD35", "EE-DD50"]) {
  catalog.push({
    maker: "象印", name: "スチーム式加湿器", modelNumber, categoryId: "humidifier",
    productUrl: "https://www.zojirushi.co.jp/syohin/life/humidifier/ee-dd/", manualUrl: steamManual,
    productLinkLabel: "公式製品ページ", manualLinkLabel: "取扱説明書", verifiedAt: "2026-10-09",
    lookupNote: "公式説明書の表紙に両品番が掲載されています。印刷18〜19ページ（PDF10ページ）の内容器洗浄とパッキン交換の目安を確認済みです。内容器洗浄は1〜2か月の幅があるため、予定は短い側の30日で計算します。水質・使用状況や汚れによって早めてください。",
    suggestions: [
      { name: "内容器のクエン酸洗浄", kind: "掃除", intervalDays: 30,
        frequency: "1〜2か月に1回（予定計算は短い側の30日）", sourceKind: "取扱説明書", sourceUrl: `${steamManual}#page=10`,
        conditions: "印刷18ページ（PDF10ページ）。クエン酸洗浄コースを使います。開始前と終了後の排水は本体が冷めてから行い、洗剤・塩素系製品と混ぜないでください。分量・操作・すすぎは説明書で確認してください。汚れ・におい・運転音が気になる場合は予定前でも実施してください。" },
      { name: "内ぶたパッキンの交換", kind: "交換", intervalDays: 365,
        frequency: "1年を目安（予定計算は365日）・白い変色時は早めに交換", sourceKind: "取扱説明書", sourceUrl: `${steamManual}#page=10`,
        conditions: "印刷19ページ（PDF10ページ）。内ぶたパッキンは消耗品です。白く変色した場合は1年を待たずに交換してください。電源を抜いて冷ましてから、適合部品と取り外し・取り付け方法を説明書で確認してください。" },
    ],
  });
}

// Release years and model covers are verified separately from maintenance intervals.
// These six manuals each explicitly cover both 35 and 50 variants.
const recentSteamManuals = [
  { family: "DE", year: 2024 }, { family: "DF", year: 2025 }, { family: "DG", year: 2026 },
  { family: "RT", year: 2024 }, { family: "RU", year: 2025 }, { family: "RV", year: 2026 },
];
for (const { family, year } of recentSteamManuals) {
  const code = `EE${family}`;
  const url = `https://www.zojirushi.co.jp/toiawase/TR_PDF/${code}.pdf`;
  const supportUrl = `https://www.zojirushi.co.jp/toiawase/manual/${code.toLowerCase()}35-${code.toLowerCase()}50/`;
  for (const capacity of [35, 50]) {
    catalog.push({
      maker: "象印", name: "スチーム式加湿器", modelNumber: `EE-${family}${capacity}`, categoryId: "humidifier",
      productUrl: supportUrl, manualUrl: url, productLinkLabel: "品番・発売年を確認できる公式ページ", manualLinkLabel: "取扱説明書",
      releaseYear: year, releaseSourceUrl: supportUrl, verifiedAt: "2026-10-09",
      lookupNote: `${year}年発売。公式説明書の表紙で対象品番、印刷18・20ページ（PDF10・11ページ）で洗浄・交換の目安を確認済みです。洗浄の1〜2か月という幅を、予定計算では短い側の30日にしています。`,
      suggestions: [
        { name: "内容器のクエン酸洗浄", kind: "掃除", intervalDays: 30,
          frequency: "1〜2か月に1回（予定計算は短い側の30日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=10`,
          conditions: "印刷18ページ（PDF10ページ）。専用のクエン酸洗浄コースを使います。塩素系洗剤と混ぜないでください。開始前と終了後の排水は本体が冷めてから行い、分量・操作・すすぎはこの品番の説明書で確認してください。水質や使用状況、汚れ・におい・運転音によっては予定前に実施してください。" },
        { name: "内ぶたパッキンの交換", kind: "交換", intervalDays: 365,
          frequency: "1年を目安（予定計算は365日）・白い変色時は早めに交換", sourceKind: "取扱説明書", sourceUrl: `${url}#page=11`,
          conditions: "印刷20ページ（PDF11ページ）。消耗品のため1年を目安に交換します。白く変色した場合は1年を待たず交換してください。電源を抜いて冷ましてから、適合部品と取り付け方法をこの品番の説明書で確認してください。" },
      ],
    });
  }
}

// Both TX variants are explicitly listed in this shared 2024 manual.
const txManual = "https://jp.sharp/restricted/support/manual/air_purifier/kitx100_tx75_mn.pdf";
const txRelease = "https://corporate.jp.sharp/news/240903-a.html";
for (const modelNumber of ["KI-TX100", "KI-TX75"]) {
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: txRelease, manualUrl: txManual, discoveredManualUrl: txManual,
    productLinkLabel: "品番・発売日を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2024, releaseSourceUrl: txRelease, verifiedAt: "2026-10-09",
    lookupNote: "2024年9月12日発売。共通説明書の表紙に両品番を掲載。23〜26ページで月ごとのお手入れを確認済みです。給水のたび・運転時間による表示・汚れやにおいの条件は、日数に置き換えず説明書で確認してください。",
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=24`,
        conditions: "説明書24ページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=24`,
        conditions: "説明書24〜25ページ。停止して電源プラグを抜き、水洗いします。フィルターを分解せず、フロートを外さないでください。汚れ・においがある場合は予定前でも実施し、洗剤・すすぎ・加湿内部洗浄の操作は説明書で確認してください。" },
      { name: "後ろパネル・センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=26`,
        conditions: "説明書26ページ。停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れが残る場合の洗浄方法は説明書を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// The UX manual independently confirms the 2025 models and monthly intervals.
const uxManual = "https://jp.sharp/restricted/support/manual/air_purifier/kiux100-ux75_mn.pdf";
const uxRelease = "https://jp.sharp/support/air_purifier/lineup/";
for (const modelNumber of ["KI-UX100", "KI-UX75"]) {
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: uxRelease, manualUrl: uxManual, discoveredManualUrl: uxManual,
    productLinkLabel: "型番・年度を確認できる公式一覧", manualLinkLabel: "取扱説明書",
    releaseYear: 2025, releaseSourceUrl: uxRelease, verifiedAt: "2026-10-09",
    lookupNote: "公式一覧の2025年度モデル。共通説明書の表紙に両品番を掲載。23〜26ページで月ごとのお手入れを確認済みです。給水のたび・運転時間による表示・汚れやにおいの条件は、日数に置き換えず説明書で確認してください。",
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=24`,
        conditions: "説明書24ページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=24`,
        conditions: "説明書24〜25ページ。停止して電源プラグを抜き、水洗いします。フィルターに力を加えず、フロートを外さないでください。汚れ・においがある場合は予定前でも実施し、洗剤・すすぎ・加湿内部洗浄の操作は説明書で確認してください。" },
      { name: "後ろパネル・センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=26`,
        conditions: "説明書26ページ。停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れが残る場合の洗浄方法は説明書を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// Each model's official support page links to the care index used below.
const sharpCareBase = "https://jp.sharp/support/air_purifier/mt_doc/";
for (const [modelNumber, releaseYear] of [["KI-TX70", 2024], ["KI-UX70", 2025], ["KI-WX70", 2026], ["KI-WX75", 2026], ["KI-WX100", 2026]] as const) {
  const large = modelNumber === "KI-WX75" || modelNumber === "KI-WX100";
  const modelSupport = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: modelSupport, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: modelSupport, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年9月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、内容と周期を確認しています。タンクは給水のたび、集じん・脱臭フィルターは汚れや吹出口のにおいが気になるときに確認してください。これらの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai_01.html`,
        conditions: "公式お手入れページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスター付きの場合はキャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${large ? "filter_humi_care06" : "filter_humi_care03"}.html`,
        conditions: large
          ? "停止して電源プラグを抜き、水洗いします。トレーシキリとローラーも洗い、フロートは外さないでください。使い捨て加湿プレフィルターは汚れていれば交換し、フィルターに力を入れすぎないでください。白色の面を本体正面側にして、公式の図で取り付けを確認します。汚れ・におい時は予定前でも確認してください。"
          : "停止して電源プラグを抜き、水洗いします。加湿フィルターを分解せず、フロートは外さないでください。汚れた使い捨て加湿プレフィルターは交換してください。お手入れ後のランプ消灯操作と、汚れ・においが残る場合のつけ置き方法は公式の図で確認します。汚れ・におい時は予定前でも確認してください。" },
      ...(large ? [
        { name: "センサー部のお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}sensor_care05.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・におい時にセンサーフィルターを水洗いしたら、十分乾かしてから取り付けてください。" },
        { name: "後ろパネルのお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}panel_care03.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。パネルに力を加えすぎないでください。汚れ・においがある場合の洗浄は公式案内に従い、十分すすいで陰干しします。" },
      ] : [
        { name: "後ろパネル・センサー部のお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}sensor_panel_care02.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・においがある場合の洗浄方法は公式案内を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
      ]),
    ],
  });
}

// S50 variants have their own explicitly linked care routes.
for (const [modelNumber, releaseYear] of [["KI-TS50", 2024], ["KI-US50", 2025], ["KI-WS50", 2026]] as const) {
  const newer = modelNumber !== "KI-TS50";
  const support = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: support, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: support, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年9月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、内容と周期を確認しています。タンクは給水のたび、集じん・脱臭フィルターは汚れや吹出口のにおいが気になるときに確認してください。これらの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai_01.html`,
        conditions: "停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスター付きの場合はキャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${newer ? "filter_humi_care07" : "filter_humi_care01"}.html`,
        conditions: newer
          ? "停止して電源プラグを抜き、水洗いします。加湿フィルターに力を加えすぎず、フロートは外さないでください。汚れた使い捨て加湿プレフィルターは交換してください。お手入れ後のランプ消灯と取り付け操作は公式の図で確認します。汚れ・におい時は予定前でも確認してください。"
          : "停止して電源プラグを抜き、水洗いします。加湿フィルターはトレーに入れたまま持ち運び、分解して洗わないでください。汚れた使い捨て加湿プレフィルターは交換してください。汚れ・においが残る場合のつけ置きと、お手入れ後のランプ消灯は公式案内で確認します。予定前でも汚れを確認してください。" },
      { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${newer ? "sensor_care06" : "sensor_care01"}.html`,
        conditions: "停止して電源プラグを抜き、センサー部のほこりを掃除機で吸い取ります。詳しい位置は機種別の公式案内で確認してください。" },
      { name: "後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}panel_care01.html`,
        conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。パネルに力を加えすぎないでください。ひどい汚れの洗浄は公式案内に従い、洗剤を十分すすいで陰干しします。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// The official pages for all three D50 variants link explicitly to care_kild50.
for (const [modelNumber, releaseYear] of [["KI-SD50", 2024], ["KI-TD50", 2025], ["KI-UD50", 2026]] as const) {
  const support = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "除加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: support, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: support, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年4月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、加湿・除湿トレーを含む内容と周期を確認しています。集じん・脱臭一体型フィルターは汚れや吹出口のにおいが気になるときに確認し、水洗い・天日干ししないでください。汚れの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai.html`,
        conditions: "停止して電源プラグを抜き、柔らかい布で拭きます。本体の水洗いや分解清掃はしないでください。キャスター付きの場合はキャスターも確認します。" },
      { name: "加湿フィルター・加湿／除湿トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}kild50/filter_humi_care_kild50.html`,
        conditions: "停止して電源プラグを抜き、トレーの水を捨ててから加湿フィルターと上段の加湿トレー・下段の除湿トレーを水洗いします。加湿フィルターは分解しないでください。フックやキャップ、ハンドルの戻し方と、清掃後のリセットボタン操作は公式の図で確認します。汚れ・におい時は予定前でも確認してください。" },
      { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}sensor_care04.html`,
        conditions: "停止して電源プラグを抜き、操作部のニオイセンサーと本体側面の温度・湿度センサーのほこりを掃除機で取ります。温度・湿度センサーのフィルターを水洗いした場合は十分に乾かしてください。詳しい位置は公式の図で確認します。" },
      { name: "後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}panel_care02.html`,
        conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・においがある場合の洗浄は公式案内に従い、台所用中性洗剤を十分すすいで陰干しします。一体型の集じん・脱臭フィルターを水洗いしないでください。" },
    ],
  });
}

const nx500Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/904/130/000000003904130/MC-NX500K.pdf";
catalog.push({
  maker: "Panasonic", name: "セパレート型コードレススティック掃除機", modelNumber: "MC-NX500K", categoryId: "vacuum",
  productUrl: "https://panasonic.jp/soji/products/MC-NX500K.html",
  manualUrl: nx500Manual, discoveredManualUrl: nx500Manual, productLinkLabel: "公式製品ページ", manualLinkLabel: "取扱説明書（PDF）", verifiedAt: "2026-10-09",
  releaseYear: 2025, releaseSourceUrl: "https://news.panasonic.com/jp/topics/206494",
  lookupNote: "メーカー発表は2025年12月中旬発売。説明書16〜17ページの月1回の紙パック確認を提案します。交換は赤い紙パック交換ランプの約2秒間隔の点滅時で、点灯は保護装置のお知らせです。純正S型紙パックAMC-U2を使用し、紙パックケースは捨てないでください。ダストボックス・プレフィルターは吸込力が回復しないときなど、ノズル・排気口・クリーンフィルターは吸込力低下や汚れが気になるときのお手入れで、固定周期は設定していません。説明書18〜21ページを確認してください。床用ノズル全体は水洗い不可、取り外した回転ブラシは水洗い可能です。内部センサーはランプのつき方がおかしいときに柔らかい布で乾拭きします。",
  suggestions: [{ name: "紙パックのゴミのたまり具合を確認", kind: "点検", intervalDays: 30,
    frequency: "月1回（特にペットの毛や綿ゴミが多いとき。予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${nx500Manual}#page=9`,
    conditions: "説明書16〜17ページ。ペットの毛や綿ゴミは、いっぱいでも交換ランプが点滅しない場合があるため、直接確認します。交換は赤いランプが約2秒間隔で点滅したとき。月ごとの一律交換ではありません。点灯や約0.3秒間隔の早い点滅は交換サインと異なり、説明書24ページで対処を確認してください。紙パック交換後は本体を充電台にセットし直します。" }],
});

const tz500Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/139/000000002409139/np-tz500.pdf";
catalog.push({
  maker: "Panasonic", name: "食器洗い乾燥機", modelNumber: "NP-TZ500", categoryId: "dishwasher",
  productUrl: "https://panasonic.jp/dish/products/NP-TZ500.html", productLinkLabel: "公式製品ページ",
  manualUrl: tz500Manual, discoveredManualUrl: tz500Manual, manualLinkLabel: "取扱説明書（PDF）",
  verifiedAt: "2026-10-09", releaseYear: 2024, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn240510-2",
  lookupNote: "メーカー発表は2024年6月下旬発売。現在の機種専用説明書11〜12ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。汚れが気になる場合は予定前でもお手入れしてください。洗剤は食洗機専用を使用し、庫内清掃に塩素系洗剤を使わないでください。タンク・投入経路は洗剤の種類を変えるときや1か月以上使わなかったときにもお手入れします。具体的な操作や部品の戻し方は公式の図で確認してください。",
  suggestions: [
    { name: "残さいフィルターの掃除", kind: "掃除", intervalDays: 7,
      frequency: "週に1回・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、残さいフィルターを取り外して掃除します。お手入れ後は取り外した部品を元どおりに取り付けてください。排水口に残る水は異常ではありません。" },
    { name: "庫内のお手入れ", kind: "掃除", intervalDays: 15,
      frequency: "月に2〜3回（予定計算は15日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。食器を入れず、食洗機専用液体洗剤の自動投入を使用し、汚れレベルL5で運転します。塩素系洗剤は使用しないでください。操作の順番と洗剤補充の確認は説明書を参照し、運転終了後は分岐水栓を閉めます。" },
    { name: "排水口カバーの掃除", kind: "掃除", intervalDays: 30,
      frequency: "月に1回（予定計算は30日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、取り外した排水口カバーを中性洗剤を含ませた柔らかいスポンジで洗います。元どおりに取り付けてください。" },
    { name: "本体・パッキン部のお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "月に1回（予定計算は30日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤を使わず、水や湯を庫内に入れたり製品にかけたりしないでください。" },
    { name: "洗剤タンク・洗剤投入経路のお手入れ", kind: "掃除", intervalDays: 90,
      frequency: "3か月ごと（予定計算は90日）・洗剤変更時・1か月以上使わなかったとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=7`,
      conditions: "説明書12〜13ページ。残った洗剤の排出方法を確認し、取り外したタンクとフロートを約40℃のお湯で洗います。水や湯以外で洗わないでください。部品を正しく戻して約40℃のお湯を入れ、お手入れモード1で経路を洗います。モード2は詰まり時の対処、モード3は洗剤排出であり、通常清掃と混同しないでください。操作順と分岐水栓の開閉は公式の図を確認します。" },
  ],
});

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "食器洗い乾燥機",
    "modelNumber": "NP-TH5",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TH5.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn240510-2",
    "lookupNote": "メーカー発表は2024年6月下旬発売。現在の説明書11〜13ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。念入りな庫内清掃には80℃すすぎを選べます。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。フィルターAのみ下かごを取り付けたまま取り外せます。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書13ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けてお手入れコースで運転します。洗いの途中の2回の停止は蒸気で汚れを浮かすためです。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "食器洗い乾燥機",
    "modelNumber": "NP-TA5",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TA5.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn240510-2",
    "lookupNote": "メーカー発表は2024年6月下旬発売。現在の説明書11〜13ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。80℃すすぎはこの機種の機能ではありません。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。フィルターAのみ下かごを取り付けたまま取り外せます。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書13ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けてお手入れコースで運転します。洗いの途中の2回の停止は蒸気で汚れを浮かすためです。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "スリムタイプ食器洗い乾燥機",
    "modelNumber": "NP-TSK2",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TSK2.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn250821-4",
    "lookupNote": "メーカー発表は2025年10月中旬発売。現在の説明書10〜12ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。念入りな庫内清掃には80℃すすぎを選べます。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書10ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。下かごは左に回転させるか取り外してから作業します。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=7",
        "conditions": "説明書12ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けて汚れレベルL3で運転します。粉末・液体は約10g、タブレットは大きさにより個数が異なります。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// The official shared manual explicitly names all four opening variants.
const fridge2025Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/742/771/000000003742771/NR-C37WS2_C37WS2L_C33JS2_C33JS2L_ARAH0A108880_%E6%B4%BB%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89.pdf";
for (const modelNumber of ["NR-C33JS2", "NR-C33JS2L", "NR-C37WS2", "NR-C37WS2L"]) {
  const ws = modelNumber.includes("C37WS2");
  const productModel = ws ? "NR-C37WS2" : "NR-C33JS2";
  catalog.push({
    maker: "Panasonic", name: "冷凍冷蔵庫", modelNumber, categoryId: "fridge",
    productUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, manualUrl: fridge2025Manual,
    productLinkLabel: "左右開き品番を確認できる公式製品情報", manualLinkLabel: "取扱説明書（活用ガイド）",
    releaseYear: 2025, releaseSourceUrl: ws ? "https://news.panasonic.com/jp/topics/206395" : "https://news.panasonic.com/jp/press/jn250821-1", verifiedAt: "2026-10-09",
    lookupNote: "2025年10月発売シリーズ。共通公式説明書の表紙で左右開き4品番を確認済みです。印刷15〜17ページで周期を確認しました。液だれ・汚れはすぐに拭き、モイスチャーコントロールプレート／フィルターは汚れが気になるときに清掃します。条件付き清掃は固定日数にしません。物理的な清掃は電源プラグを抜き、再接続まで7分以上待ってください。製氷皿の自動清掃時は電源が必要です。",
    suggestions: [
      { name: "給水タンク・浄水フィルターの水洗い", kind: "掃除", intervalDays: 7, frequency: "週1回（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。電源プラグを抜き、タンク・フィルター・フタのパッキングを外してやさしく水洗いします。水道水以外を使う場合はぬめりやカビが発生しやすいため、さらにこまめに水洗いしてください。" },
      { name: "ガラストレイ・わけられるん棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜き、説明書の取り外し図に従って清掃します。重いガラス棚の落下・破損に注意。取り外せない仕切棚は柔らかい布で拭きます。落ちにくい汚れには薄めた台所用中性洗剤を使い、水拭きしてください。" },
      { name: "ドア棚・ボトル棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜いて清掃。ボトル棚の前に上のドア棚を外し、取り付けは水平に差し込んで押し下げます。固く絞った布を使い、水分をすき間に入れないでください。" },
      { name: "パーシャル・野菜室・冷凍室ケースの清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。電源プラグを抜き、部品別の取り外し図に従います。レールの潤滑剤は拭き取らないでください。水洗い後は水滴を拭き、冷凍室上段ケース・小物野菜ケースはFRONTを前にして戻します。" },
      { name: "製氷皿の自動水洗い", kind: "掃除", intervalDays: 180, frequency: "年1〜2回（予定計算は180日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=8`,
        conditions: "印刷15ページ（PDF8）。製氷皿は取り外せません。電源を入れた状態でタンクに水だけを入れ、冷凍室上段ケースの氷を空にして製氷停止ボタンを10秒以上押します。清掃中（約3分）は冷凍室ドアを開けず、終了後に排出された水を捨てて拭き取ります。" },
      { name: "電源プラグ・冷蔵庫周囲・脚カバーのほこり取り", kind: "掃除", intervalDays: 365, frequency: "年1回（予定計算は365日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜き、背面・壁面・床などのすき間のほこりを取り除きます。脚カバーは説明書4ページの方法で外します。床の保護や転倒防止など移動時の注意を確認し、無理に動かさないでください。" },
      { name: "製氷用浄水フィルターの交換", kind: "交換", intervalDays: 1095, frequency: "約3年を目安（予定計算は1095日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。浄水フィルターは約3年が交換目安です。水あかなどが詰まると製氷できない場合があります。既に使用している場合は使用開始日を基に予定を調整し、交換部品は説明書22ページで確認してください。" },
    ],
  });
}

// The official shared manual explicitly names all four opening variants.
const fridgeEs2025Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/487/471/000000003487471/NR-C37ES2_C37ES2L_C33ES2_C33ES2L_ARAH0A108600_%E6%B4%BB%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89.pdf";
for (const modelNumber of ["NR-C33ES2", "NR-C33ES2L", "NR-C37ES2", "NR-C37ES2L"]) {
  const large = modelNumber.includes("C37ES2");
  const productModel = large ? "NR-C37ES2" : "NR-C33ES2";
  catalog.push({
    maker: "Panasonic", name: "冷凍冷蔵庫", modelNumber, categoryId: "fridge",
    productUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, manualUrl: fridgeEs2025Manual,
    productLinkLabel: "左右開き品番を確認できる公式製品情報", manualLinkLabel: "取扱説明書（活用ガイド）",
    releaseYear: 2025, releaseSourceUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, verifiedAt: "2026-10-09",
    lookupNote: "2025年7月発売シリーズ。共通公式説明書の表紙で左右開き4品番を確認済みです。印刷11〜13ページで周期を確認しました。液だれ・汚れはすぐに拭き、モイスチャーコントロールプレート／フィルターは汚れが気になるときに清掃します。条件付き清掃は固定日数にしません。物理的な清掃は電源プラグを抜き、再接続まで7分以上待ってください。製氷皿の自動清掃時は電源が必要です。",
    suggestions: [
      { name: "給水タンク・浄水フィルターの水洗い", kind: "掃除", intervalDays: 7, frequency: "週1回（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。電源プラグを抜き、タンク・フィルター・フタのパッキングを外してやさしく水洗いします。水道水以外を使う場合はぬめりやカビが発生しやすいため、さらにこまめに水洗いしてください。" },
      { name: "ガラストレイ・わけられるん棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜き、説明書の取り外し図に従って清掃します。重いガラス棚の落下・破損に注意。取り外せない仕切棚は柔らかい布で拭きます。落ちにくい汚れには薄めた台所用中性洗剤を使い、水拭きしてください。" },
      { name: "ドア棚・ボトル棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜いて清掃。ボトル棚の前に上のドア棚を外し、取り付けは水平に差し込んで押し下げます。固く絞った布を使い、水分をすき間に入れないでください。" },
      { name: "チルドルーム・野菜室・冷凍室ケースの清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。電源プラグを抜き、部品別の取り外し図に従います。レールの潤滑剤は拭き取らないでください。水洗い後は水滴を拭き、冷凍室上段ケース・小物野菜ケースはFRONTを前にして戻します。" },
      { name: "製氷皿の自動水洗い", kind: "掃除", intervalDays: 180, frequency: "年1〜2回（予定計算は180日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=6`,
        conditions: "印刷11ページ（PDF6）。製氷皿は取り外せません。電源を入れた状態でタンクに水だけを入れ、冷凍室上段ケースの氷を空にして製氷を停止してから、製氷停止ボタンを10秒以上押します。清掃中（約3分）は冷凍室ドアを開けず、終了後に排出された水を捨てて拭き取ります。" },
      { name: "電源プラグ・冷蔵庫周囲・脚カバーのほこり取り", kind: "掃除", intervalDays: 365, frequency: "年1回（予定計算は365日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜き、背面・壁面・床などのすき間のほこりを取り除きます。脚カバーは説明書4ページの方法で外します。床の保護や転倒防止など移動時の注意を確認し、無理に動かさないでください。" },
      { name: "製氷用浄水フィルターの交換", kind: "交換", intervalDays: 1095, frequency: "約3年を目安（予定計算は1095日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。浄水フィルターは約3年が交換目安です。水あかなどが詰まると製氷できない場合があります。既に使用している場合は使用開始日を基に予定を調整し、交換部品は説明書18ページで確認してください。" },
    ],
  });
}

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc62x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc54x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC49X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc49x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXCC専用の共通説明書の表紙で2品番を確認済みです。39〜40ページの清掃周期を確認しました。41ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。 カメラは汚れが気になるときに柔らかい布でほこりを拭き取ります（39ページ）。日数の定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書42ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXCC専用の共通説明書の表紙で2品番を確認済みです。39〜40ページの清掃周期を確認しました。41ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。 カメラは汚れが気になるときに柔らかい布でほこりを拭き取ります（39ページ）。日数の定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書42ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VWC57X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC57X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC57X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、VWC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VWC50X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC50X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC50X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、VWC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GZC67X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GZC67X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GZC67X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と専用説明書の表紙を確認済みです。39〜40ページの周期に基づく候補です。電動引き出しは食品が落ちた・挟まった・汁がたまったときに電源プラグを抜き、柔らかい乾いた布で清掃します。水をかけず、分解せず、リンク部を動かさないでください（40ページ）。この条件を日数の定期予定には変換しません。製氷おそうじは初回・1週間以上不使用後のみ。通電状態で全てのドアを閉め、MENUをタッチして表示を点灯後、Ice Makerを5秒以上タッチし、終了する約4分間はドアを開けません（41ページ）。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年5月発売の公式サポートと専用説明書を確認済み。41〜42ページの周期を提案します。カメラは気になるとき柔らかい布で清掃（41ページ）。電動引き出しは異物や汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（42ページ）。製氷おそうじは初回・1週間不使用後、通電状態で製氷を5秒以上押し、約4分全ドアを閉めます（43ページ）。これら条件付き作業は定期予定にしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書44ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年5月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

export function normalizeModel(value: string) {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[‐‑‒–—−ー]/g, "-").replace(/\s+/g, "");
}
export function lookupModel(value: string) {
  const model = normalizeModel(value);
  // Exact matching only: similar product numbers do not establish applicability.
  return catalog.filter((candidate) => normalizeModel(candidate.modelNumber) === model);
}


// Links are discovery aids only. Search results never become verified suggestions.
export function officialSearchLinks(value: string) {
  const model = normalizeModel(value);
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model)) return [];
  return [
    { maker: "SHARP", domain: "jp.sharp" },
    { maker: "Panasonic", domain: "panasonic.jp" },
    { maker: "日立", domain: "kadenfan.hitachi.co.jp" },
    { maker: "象印", domain: "zojirushi.co.jp" },
    { maker: "三菱電機", domain: "mitsubishielectric.co.jp" },
    { maker: "ダイキン", domain: "daikin.co.jp" },
  ].map(({ maker, domain }) => ({ maker, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} "${model}" 取扱説明書 お手入れ`)}` }));
}


// R-H54X/R-H49X: own shared manual cover and pages 23–27 verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年4月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年4月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// HWS47X/XL: shared manual cover and care diagrams independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// V38X/XL and V32X/XL: own manual cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// R-27X: own cover and care pages 10/11 verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27X",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27X/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27X/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2025年9月発売の公式サポートとR-27X専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});



// R-H54XG: dedicated manual independently verified, pages 23–27 and 35.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-H54XG",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54XG/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54XG/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2025年10月発売の公式サポートと、R-H54XGを明記した専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
  "suggestions": [
    {
      "name": "給水タンク・浄水フィルターの水洗い",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "週に1回（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
    },
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "特鮮氷温ルームの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・側面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
    },
    {
      "name": "製氷用浄水フィルターの交換",
      "kind": "交換",
      "intervalDays": 1095,
      "frequency": "約3〜4年が目安（予定計算は1095日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
    }
  ]
});



// R-H54WY/R-H49WY: dedicated manual cover and pages 23–27 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54WY",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54WY/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54WY/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49WY",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49WY/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49WY/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// R-H54W/R-H49W: own manual independently verified, pages 23–27/35.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// HWS47V/VL: own cover and care diagrams independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年10月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年10月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// V38V/VL and V32V/VL: dedicated cover and pages 16–18/23 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// R-27V: own manual cover and printed care pages 10/11 independently verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27V",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27V/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27V/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2024年10月発売の公式サポートとR-27V専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});

// R-HS47V/VL: dedicated manual cover and pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HS47V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年6月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HS47VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年6月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HWC62Y/54Y/49Y: own manual cover and pages 35–39/50 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC62Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC62Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC62Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC49Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC49Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC49Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HZC62Y/54Y: dedicated cover and care pages 35–39/50 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HZC62Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC62Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC62Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、2品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。電源プラグを抜き、食品を出し、38ページの図に従ってケースを外し、アルミトレイ・真空容器・パッキングと受け部をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、LED庫内灯部分はやさしく拭いてください。パッキングの汚れがひどいときは柔らかいスポンジなどで水洗いし、水分を拭き取り自然乾燥させます（汚れ時のみで別の定期予定にはしません）。取り付け後はパッキングの緩みやケースのがたつきを確認し、ハンドルを下げてロックしてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HZC54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、2品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。電源プラグを抜き、食品を出し、38ページの図に従ってケースを外し、アルミトレイ・真空容器・パッキングと受け部をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、LED庫内灯部分はやさしく拭いてください。パッキングの汚れがひどいときは柔らかいスポンジなどで水洗いし、水分を拭き取り自然乾燥させます（汚れ時のみで別の定期予定にはしません）。取り付け後はパッキングの緩みやケースのがたつきを確認し、ハンドルを下げてロックしてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-H54Y/49Y: dedicated cover and care pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年4月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従ってケースを外して、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面からの水垂れに注意してください。下段ケースを水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものは使わず、ケースや引き出しレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年4月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従ってケースを外して、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面からの水垂れに注意してください。下段ケースを水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものは使わず、ケースや引き出しレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HWS47Y/YL: dedicated cover and pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従って外してぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。ケース背面からの水垂れに注意し、水洗い後は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従って外してぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。ケース背面からの水垂れに注意し、水洗い後は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// V Y: own four-model cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
 ] satisfies ProductCandidate[]);



// R27Y own cover and care diagrams verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27Y",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27Y/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27Y/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2026年8月発売の公式サポートとR-27Y専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});



// KW57YJ: dedicated cover and pages23–27/35 verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-KW57YJ",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KW57YJ/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KW57YJ/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2026年10月発売の公式サポートとR-KW57YJ専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
  "suggestions": [
    {
      "name": "給水タンク・浄水フィルターの水洗い",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "週に1回（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
    },
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "特鮮氷温ルームの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。 ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従ってケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。切替室の下段ケースを外す前にしきりを外してください。取り付け時はしきりの「R」を正面右下にし、ケースに最後まで入れます。下段ケース背面から水がたれる場合があるので注意し、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・側面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、6ページの図に従って脚カバーを外し調節脚を床から浮かせ、冷蔵庫を手前に引き出して清掃します。傷つきやすい床は板などで保護してください。"
    },
    {
      "name": "製氷用浄水フィルターの交換",
      "kind": "交換",
      "intervalDays": 1095,
      "frequency": "約3〜4年が目安（予定計算は1095日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
    }
  ]
});



// HW V own three-model cover and care pages verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW49V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW49V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW49V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// VW V own two-model cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VW57V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW57V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW57V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したVW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室・冷凍室下段の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースは「手前 FRONT」を手前にし、冷凍室下段はスリットのある方を手前にします。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VW50V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW50V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW50V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したVW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室・冷凍室下段の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースは「手前 FRONT」を手前にし、冷凍室下段はスリットのある方を手前にします。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXC V専用説明書を確認済み。39〜40ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（41ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は41ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。電源プラグを抜き、食品を出して43ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書54ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXC V専用説明書を確認済み。39〜40ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（41ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は41ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。電源プラグを抜き、食品を出して43ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書54ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年1月発売の公式サポートと、両品番を明記したH V専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。 冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットします。野菜室の上段ケースは「手前 FRONT」を手前にし、取り付け後はハンドルを持って操作し正しく取り付けたことを確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年1月発売の公式サポートと、両品番を明記したH V専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。 冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットします。野菜室の上段ケースは「手前 FRONT」を手前にし、取り付け後はハンドルを持って操作し正しく取り付けたことを確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-KXCC57V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KXCC57V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KXCC57V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと、品番を明記したKXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従ってケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。上下の切替室は下段ケースを外す前に必ずしきりを外してください。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースの「手前 FRONT」を手前にし、冷凍室はスリットのある方も手前にします。切替室は取り付け後に上段ケースを左右にスライドさせ正しい取り付けを確認してください。下段ケース背面から水がたれる場合に注意し、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。 真空チルドケースは44ページの図に従い最後にハンドルを下げてロックします。真空チルドルームと野菜室のプラチナ触媒は取り外さず、水洗いしないでください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。 野菜室の下段ケースを外す前にしきりを外し、しきりの「R」を正面右下にして最後まで取り付けます。上段ケースと冷凍室下段の小物ケースは「手前 FRONT」を手前にし、小物ケースはスリットのある方を手前にします。説明書にない部品を取り外さないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと、品番を明記したGXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。 電動引き出しは異物・汁があるとき電源プラグを抜き、42ページの図に従いケースを外して乾拭きします。ユニットに水をかけず、分解やリンク操作をしないでください。定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず水洗いしないでください。下段ケースを外す前に必ずしきりを外し、再装着時はしきりの「PLATINUM」を図の向きに合わせて取り付けます。下段ケースはしきりを付けずに本体へ入れないでください。上段ケースの「手前 FRONT」を手前にし、冷凍室下段の小物ケースはスリットも手前、左右のつめは大物ケースの外側にします。下段ケースを水洗いした場合は裏返して排水し十分乾燥させます。背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。 真空チルドケースは44ページの図に従い最後にハンドルを下げてロックします。真空チルドルームと野菜室のプラチナ触媒は取り外さず、水洗いしないでください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。 野菜室の下段ケースを外す前にしきりを外し、しきりの「R」を正面右下にして最後まで取り付けます。上段ケースと冷凍室下段の小物ケースは「手前 FRONT」を手前にし、小物ケースはスリットのある方を手前にします。説明書にない部品を取り外さないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、品番を明記したGXCC W専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。 電動引き出しは異物・汁があるとき電源プラグを抜き、42ページの図に従いケースを外して乾拭きします。ユニットに水をかけず、分解やリンク操作をしないでください。定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず水洗いしないでください。下段ケースを外す前に必ずしきりを外し、再装着時はしきりの「PLATINUM」を図の向きに合わせて取り付けます。下段ケースはしきりを付けずに本体へ入れないでください。上段ケースの「手前 FRONT」を手前にし、冷凍室下段の小物ケースはスリットも手前、左右のつめは大物ケースの外側にします。下段ケースを水洗いした場合は裏返して排水し十分乾燥させます。背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-27TV",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27TV/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27TV/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2023年10月発売の公式サポートとR-27TV専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
    "suggestions": [
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。 上段ケースのふちは下段ケース左右のふちにのせ、下段ケース左右後側の突起を枠の角穴に入れます。枠のローラーはレール内に入れ、11ページの図で確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ25A",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ25A/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2026年2月発売を確認。専用説明書の印刷12〜13ページ（PDF7ページ）では吸込力が弱くなったとき（月1回程度）／気になったときのお手入れです。フィルターは紙パック交換後も吸込力が戻らないときだけ、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷13ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使い、挿入方向を合わせます（印刷10〜11ページ）。フィルター清掃や紙パック交換を固定周期にはしません。",
    "suggestions": [
      {
        "name": "床用ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf#page=7",
        "conditions": "説明書印刷12ページ（PDF7ページ）。切を押し電源プラグを抜く。絡まった髪の毛はピンセット等で取り除き、絡まったゴミは溝に沿ってはさみで切る。汚れがひどい場合のブラシカバーと回転部の脱着は図のひらく／しまる方向に従う。水洗い後は水を切り陰干しし、ドライヤーや洗剤を使わない。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf#page=7",
        "conditions": "説明書印刷13ページ（PDF7ページ）。切を押し電源プラグを抜き、柔らかい布で水拭きする。本体・ホース・延長管は水洗い禁止。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ250G",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ250G/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書印刷14〜16ページ（PDF8〜9ページ）のお手入れは、吸込力が弱くなったとき（月1回程度）／気になったときです。フィルターは紙パック交換後も吸込力が戻らないとき、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷16ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使用します（印刷12〜13ページ）。紙パック交換とフィルター清掃は固定周期にはしません。 ゴミ検知ランプのつき方がおかしいとき（消えないなど）は、内部センサーを柔らかい布でから拭きします。水洗い禁止、固定周期にはしません（印刷15ページ）。",
    "suggestions": [
      {
        "name": "親ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷14ページ（PDF8ページ）。切を押し電源プラグを抜き、接点・ローラーなどのごみを取り除きます。親ノズル本体は水洗い禁止で、回転部（ブラシ）だけ水洗いできます。取り外し・再装着時はベルトとブラシカバーのつめ、ひらく／しまるの方向を説明書の図で確認してください。水洗いしたブラシは水を切り陰干しして十分乾燥させ、ドライヤー・洗剤を使わないでください。"
      },
      {
        "name": "子ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、接点などのごみを取り除きます。子ノズルは水洗い禁止です。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、柔らかい布を固く絞って水拭きします。本体・ホース・延長管は水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使わないでください。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ25G",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ25G/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書印刷14〜16ページ（PDF8〜9ページ）のお手入れは、吸込力が弱くなったとき（月1回程度）／気になったときです。フィルターは紙パック交換後も吸込力が戻らないとき、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷16ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使用します（印刷12〜13ページ）。紙パック交換とフィルター清掃は固定周期にはしません。",
    "suggestions": [
      {
        "name": "親ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷14ページ（PDF8ページ）。切を押し電源プラグを抜き、接点・ローラーなどのごみを取り除きます。親ノズル本体は水洗い禁止で、回転部（ブラシ）だけ水洗いできます。取り外し・再装着時はベルトとブラシカバーのつめ、ひらく／しまるの方向を説明書の図で確認してください。水洗いしたブラシは水を切り陰干しして十分乾燥させ、ドライヤー・洗剤を使わないでください。"
      },
      {
        "name": "子ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、接点などのごみを取り除きます。子ノズルは水洗い禁止です。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、柔らかい布を固く絞って水拭きします。本体・ホース・延長管は水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使わないでください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-JP890K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-JP890K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/157/000000003745157/MC-JP890K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷14〜15ページ（PDF8ページ）では吸込力が弱くなったとき／気になったときのお手入れで、月1回の清掃とは記載されていません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ水洗いでき、ベルト・カバーのつめ・ひらく／しまる方向を図で確認し、十分乾燥させます。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭きし、水洗い禁止。フィルターは紙パック交換後も吸込力が戻らないときだけ軽くはたくか軽く水洗いし、押し洗いします。もみ洗い・洗濯機洗いをせず十分乾燥させ、図の印を上側に、ガイド（ゴム部）と溝の内側に再装着します。紙パックはランプの点滅・点灯時に純正M型Vタイプを使用し、挿入方向を合わせます（印刷12〜13ページ）。清掃・フィルター・紙パック交換を固定周期にはしません。",
    "suggestions": [
      {
        "name": "紙パックのたまり具合の確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/157/000000003745157/MC-JP890K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。ペットの毛や綿ごみが多いと、満杯でも紙パック交換ランプが反応しない場合があるため、直接たまり具合を確認します。この条件に当てはまる場合だけ追加してください。切を押し電源プラグを抜きます。交換自体は固定周期ではなくランプ・たまり具合で判断し、純正M型Vタイプを使用します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式キャニスター掃除機",
    "modelNumber": "MC-SR640K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SR640K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/163/000000003745163/MC-SR640K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。ゴミの量は種類によって変わるため、ゴミすてラインに達する前に捨てます。ペットの毛や綿ごみが多いと、ランプがつかなくても満杯の場合があります。清掃は吸込力が弱くなったとき／気になったとき、お手入れランプ点灯時などに行い、固定周期にはしません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ洗え、ベルト・カバーのつめ・ひらく／しまるの方向を図で確認し、十分乾燥させます。サイクロンユニットは約1時間水につけ、水中で振って流水洗浄。クリーンフィルターは軽くはたくか軽く流水で洗い、ブラシでこすりません。水洗いしたダストボックス類・ユニット・フィルターは風通しのよい場所で約24時間十分乾燥させてから戻します。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭き、水洗い禁止。付属のふとん用ノズルは必要時に軽く水洗いでき、十分乾燥させます（印刷14ページ）。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/163/000000003745163/MC-SR640K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。切を押し電源プラグを抜き、ゴミの量を確認します。ラインを超える前に、週の予定を待たずこまめに捨ててください。本体を立てたままダストボックスを外さず、底ぶたをカチッと閉めて本体へ確実に戻します。清掃で分解した場合はネットフィルター・サイクロンユニットを図の位置に必ず戻し、ふたのフックを掛けてください。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "サイクロン式キャニスター掃除機",
    "modelNumber": "MC-SR44K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SR44K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/168/000000003745168/MC-SR44K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。ゴミの量は種類によって変わるため、ゴミすてラインに達する前に捨てます。ペットの毛や綿ごみが多いと、ランプがつかなくても満杯の場合があります。清掃は吸込力が弱くなったとき／気になったとき、お手入れランプ点灯時などに行い、固定周期にはしません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ洗え、ベルト・カバーのつめ・ひらく／しまるの方向を図で確認し、十分乾燥させます。サイクロンユニットは約1時間水につけ、水中で振って流水洗浄。クリーンフィルターは軽くはたくか軽く流水で洗い、ブラシでこすりません。水洗いしたダストボックス類・ユニット・フィルターは風通しのよい場所で約24時間十分乾燥させてから戻します。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭き、水洗い禁止。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/168/000000003745168/MC-SR44K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。切を押し電源プラグを抜き、ゴミの量を確認します。ラインを超える前に、週の予定を待たずこまめに捨ててください。本体を立てたままダストボックスを外さず、底ぶたをカチッと閉めて本体へ確実に戻します。清掃で分解した場合はネットフィルター・サイクロンユニットを図の位置に必ず戻し、ふたのフックを掛けてください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NX700K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NX700K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/683/000000002777683/mc-nx700k.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年3月発売を確認。専用説明書印刷14〜20ページ（PDF8〜11ページ）を確認。お手入れ前は運転スイッチを切り、充電台の電源プラグを抜きます。紙パック交換は約2秒間隔の赤い点滅時に純正S型AMC-U2を使用。ケースは捨てず、交換後に本体を充電台へセットし直します。ダストボックスやプレ・スポンジフィルターは吸込力が戻らない／弱くなったとき（紙パック交換時）に清掃します。ネットフィルターを必ず戻し、底ぶたをカチッと閉めます。プレフィルターの凹凸を合わせて装着します。水洗いしたダストボックス・ネットフィルター・プレ／スポンジフィルターは風通しのよい場所で約24時間十分乾燥させます。ネットフィルターの汚れが残る場合は約1時間水につけ、水中で振って流水洗浄します。床用ノズルの回転ブラシは取り外して水洗いするタイプではなく、固く絞った布で水拭きし、ノズルカバーだけ水洗い可能です。カバーのつめを2か所の凹部に合わせます。ふとん用ノズル・ドックのクリーンフィルターは必要時に軽く水洗いでき、乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ乾拭き。充電端子・排気口・本体・延長管・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールは使いません。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/683/000000002777683/mc-nx700k.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があるため、直接確認します。該当する場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、紙パックケースをゆっくり外します。ケースは捨てません。交換は固定周期ではなく状態に応じて、純正S型AMC-U2を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NX810KM",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NX810KM/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/673/000000002777673/MC-NX810KM.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年10月発売を確認。専用説明書印刷16〜23ページ（PDF9〜12ページ）と付属注意書きを確認。お手入れ前は運転スイッチを切り、充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換し、ケースは捨てず、本体を充電台にセットし直します。ダストボックスとプレ／スポンジフィルターは吸込力が戻らない／弱くなったとき（紙パック交換時）に清掃。ネットフィルターを必ず戻し、底ぶたをカチッと閉め、プレフィルターの凹凸を合わせます。洗ったダストボックス・ネットフィルター・プレ／スポンジフィルターは風通しのよい場所で約24時間十分乾燥させます。ネットフィルターの汚れが残るときは約1時間水につけ、水中で振って流水洗浄します。床用ノズル本体は水洗い禁止で、回転ブラシは外して水洗い可能です。ベルト、カバーのつめ、図の解錠／施錠マークを合わせて戻し、十分乾燥させます。給水タンクは内側だけ水洗い可能。接点の水滴・ほこりは綿棒で除き、強く押しつけません。掃除後はタンクの水を捨てます。常温の水道水以外は入れず、ミスト吹出口も綿棒で手入れします。ふとん用ノズル・ドックのクリーンフィルターは必要時に軽く水洗いでき、乾燥後に戻します。センサーはクリーンランプの色が変わらないときのみ乾拭き。充電端子・排気口・本体・延長管・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールは使いません。清掃・紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/673/000000002777673/MC-NX810KM.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があるため直接確認します。該当する場合だけ追加してください。運転スイッチを切り、充電台の電源プラグを抜きます。ケースをゆっくり外し、ケースは捨てません。交換は固定周期ではなく状態に応じて純正S型AMC-U2を使用します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NS100K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NS100K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/015/000000000386015/mc-ns100k.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2023年11月発売を確認。専用説明書と共通のお手入れガイドを確認。お手入れ前は運転スイッチを切り充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換。ケースは捨てず、交換後に本体を充電台にセットし直します。フィルターケースは吸込力が回復しない／弱くなったとき（紙パック交換時）に清掃します。フィルター類は軽くはたき、歯ブラシなどでこすりません。水洗い時は約30分水につけ、水中で振って洗い、風通しのよい場所で約24時間十分乾燥させます。スポンジの切り欠きを合わせ、少し長くなっても押し込みません。不織布フィルターのゴムが外れたら凸部をゴムの溝にはめます。ケースのつめを本体の凹部に合わせカチッと戻します。床用ノズル本体は水洗い禁止。回転ブラシは固く絞った布で水拭きし、ノズルカバーだけ水洗いできます。カバーのつめを2か所の凹部に合わせます。プレフィルターとドックのクリーンフィルターは必要時に軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。充電端子・吸気路・排気口・吸気口・本体・ハンドル・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。青・赤ランプが同時点滅したらまずドックへ戻し、それでも消えない／吸込力が回復しなければケースを手入れします。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/015/000000000386015/mc-ns100k.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があります。この条件に当てはまる場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、ケースをゆっくり外して直接確認します。ケースは捨てません。交換自体は固定周期ではなく状態に応じて純正S型AMC-U2を使います。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NS70F",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NS70F/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/016/000000000386016/mc-ns70f.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2023年11月発売を確認。専用説明書と共通のお手入れガイドを確認。お手入れ前は運転スイッチを切り充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換。ケースは捨てず、交換後に本体を充電台にセットし直します。フィルターケースは吸込力が回復しない／弱くなったとき（紙パック交換時）に清掃します。フィルター類は軽くはたき、歯ブラシなどでこすりません。水洗い時は約30分水につけ、水中で振って洗い、風通しのよい場所で約24時間十分乾燥させます。スポンジの切り欠きを合わせ、少し長くなっても押し込みません。不織布フィルターのゴムが外れたら凸部をゴムの溝にはめます。ケースのつめを本体の凹部に合わせカチッと戻します。床用ノズルは水洗い禁止。巻きついたごみはピンセットやはさみで取り除きます。プレフィルターとドックのクリーンフィルターは必要時に軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。充電端子・吸気路・排気口・吸気口・本体・ハンドル・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。青・赤ランプが同時点滅したらまずドックへ戻し、それでも消えない／吸込力が回復しなければケースを手入れします。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/016/000000000386016/mc-ns70f.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があります。この条件に当てはまる場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、ケースをゆっくり外して直接確認します。ケースは捨てません。交換自体は固定周期ではなく状態に応じて純正S型AMC-U2を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式コードレススティック掃除機",
    "modelNumber": "MC-PB61J",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PB61J/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年11月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。お手入れは吸込力が弱くなったとき（月1回程度）／気になったとき。床用ノズル本体・排気口・本体・延長管・スタンドは水洗い禁止で、回転ブラシだけ取り外して水洗いできます。フィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。紙パック交換は赤ランプの点滅がもうすぐ交換、点灯がすぐ交換で、ドック型NS/NXのランプ意味を流用しません。純正S型AMC-U2。交換自体に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "床用ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。床用ノズル本体は水洗い禁止。回転部（ブラシ）だけ外して水洗いできます。絡まったごみは溝に沿ってはさみで切ります。説明書のベルト・ブラシカバー・起毛布側と解錠／施錠マークを確認して戻してください。洗ったブラシは十分乾燥させ、熱風や洗剤を使いません。"
      },
      {
        "name": "排気口の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。排気口のごみを取り除きます。水洗い禁止です。"
      },
      {
        "name": "本体・延長管・スタンドの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。柔らかい布を固く絞って水拭きします。本体・延長管・スタンドは水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。軽くはたいてほこりを落とすか、軽く水洗いします。洗ったら水気を切り十分乾燥させ、必ず取り付けてください。ドライヤーなどの熱風や洗剤・ベンジン・シンナー・アルコールを使いません。"
      },
      {
        "name": "紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。満杯でもランプが反応しない場合があるため、この条件に当てはまる場合だけ追加してください。運転スイッチを切り、充電アダプターを抜きます。交換は固定周期ではなく、赤いランプの約2秒間隔の点滅はもうすぐ交換、点灯はすぐ交換です。純正S型AMC-U2を横長方向（A方向）に挿入し、白ボール紙を枠に沿わせて広げます。ケースはカチッと戻し紙パックを挟み込みません。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB35K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB35K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/956/000000003590956/MC-SB35K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書を確認。お手入れ前は「切」を押し、充電アダプターを抜きます。ゴミ捨てはラインを超える前にこまめに行います。ダストボックス清掃はゴミを捨てても吸込力が戻らないとき、または赤いお手入れランプが点灯したとき。標準運転ではランプは光りません。ネットフィルターを外してごみを捨て、プリーツフィルターを図の向きで戻し、ネットフィルターをダストカップに戻して本体にカチッと装着します。水洗いする場合はネットフィルターを約30分水につけ、プリーツフィルターは流水で洗い、ブラシでこすりません。洗った部品は風通しのよい場所で約24時間十分乾燥させます。床用ノズル本体・排気口・本体・延長管・スタンドは水洗い禁止。回転ブラシだけ取り外して水洗いでき、ベルト・カバー・起毛布側と解錠／施錠マークを確認して戻します。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。清掃は吸込力が弱くなったとき／気になったときで、固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/956/000000003590956/MC-SB35K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。「切」を押し、充電アダプターを抜きます。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターをダストカップに戻して本体に確実にカチッと装着します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB55K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB55K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/953/000000003590953/MC-SB55K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書を確認。お手入れ前は「切」を押し、充電台から本体を外します。ゴミ捨てはラインを超える前にこまめに行います。ダストボックス清掃はゴミを捨てても吸込力が戻らないとき、または操作部の青色・赤色ランプが同時点滅して吸わなくなったとき。ネットフィルターを外してごみを捨て、プリーツフィルターを図の向きで戻し、ネットフィルターをダストカップに戻して本体にカチッと装着します。水洗いする場合はネットフィルターを約30分水につけ、プリーツフィルターは流水で洗い、ブラシでこすりません。洗った部品は風通しのよい場所で約24時間十分乾燥させます。床用ノズル本体・排気口・本体・延長管・充電台は水洗い禁止。回転ブラシだけ取り外して水洗いでき、ベルト・カバー・起毛布側と解錠／施錠マークを確認して戻します。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。ゴミ検知ランプのつき方がおかしいときのみ、内部センサーを柔らかい布で乾拭きします。センサーは水洗い禁止です。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。清掃は吸込力が弱くなったとき／気になったときで、固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/953/000000003590953/MC-SB55K.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。「切」を押し、充電台から本体を外します。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターをダストカップに戻して本体に確実にカチッと装着します。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB70KM",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB70KM/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/679/000000002777679/MC-SB70KM.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年10月発売を確認。専用説明書印刷16〜21ページ（PDF9〜11ページ）と給水タンク注意書きを確認。お手入れ前は運転スイッチを切り、充電アダプターを抜きます。ゴミはラインを超える前にこまめに捨てます。清掃はゴミ捨て後も吸込力が戻らないとき／操作部の青・赤ランプが同時点滅して吸わなくなったときなどに行い、固定周期を設定しません。ダストフィルターは軽くはたき、表面のごみはティッシュで拭き取ります。ダストカップ・ネットフィルター・ダストフィルター・スポンジフィルターは汚れが気になるとき水洗いでき、約24時間風通しのよい場所で十分乾燥させます。スポンジをダストフィルターに確実に戻し、ネットフィルターとダストフィルターをセットして、ダストボックスをカチッと装着します。床用ノズル本体は水洗い禁止で、回転ブラシだけ外して水洗いできます。ベルト・カバーのつめ・解錠／施錠マークを合わせ十分乾燥後に戻します。給水タンクは内側だけ水洗い可能。接点の水滴・ほこりは綿棒で取り除き、強く押しつけません。常温の水道水以外は入れず、掃除後は水を捨てます。ミスト吹出口も水滴・ほこりを綿棒で取り除き、強く押しつけません。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。ふとん用ノズルは必要時に軽く水洗いし、十分乾燥させます。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。センサー・排気口・本体・延長管・スタンドは水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/679/000000002777679/MC-SB70KM.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。運転スイッチを切り、充電アダプターを抜きます。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターとダストフィルターを戻し、本体に確実にカチッと装着します。"
      }
    ]
  }
] satisfies ProductCandidate[]);
export const supportedModels = catalog.map(candidate => candidate.modelNumber);
