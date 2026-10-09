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
