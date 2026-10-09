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
    lookupNote: `${releaseYear}年9月発売と公式機種別サポートに掲載。そこから案内されるお手入れページ（${large ? "care_index08" : "care_index04"}）で内容と周期を確認しています。PDFの自動抽出結果ではありません。タンクは給水のたび、集じん・脱臭フィルターは汚れや吹出口のにおいが気になるときに確認してください。これらの条件を固定日数に置き換えません。`,
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

export function normalizeModel(value: string) {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[‐‑‒–—−ー]/g, "-").replace(/\s+/g, "");
}
export function lookupModel(value: string) {
  const model = normalizeModel(value);
  // Exact matching only: similar product numbers do not establish applicability.
  return catalog.filter((candidate) => normalizeModel(candidate.modelNumber) === model);
}

export const supportedModels = catalog.map(candidate => candidate.modelNumber);
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
