import type { NamePoolKey } from './names';

export interface Nation {
  code: string;
  name: string;
  /** For tight spaces, when the name is long: "Bosnia and Herzegovina" → "Bosnia". */
  shortName?: string;
  /** Two or three flag colours; the first tints the header, so it is never black or white. */
  colours: string[];
  region: Region;
  /** The regional pool for names, for a nation without its own list in commonNames.ts. */
  names: NamePoolKey;
}

type Row = [code: string, name: string, colours: string, names: Nation['names'], shortName?: string];

/** Football's continents; Australia plays in Asia and Israel and Kazakhstan in Europe, as in real life. */
export type Region = 'europe' | 'southAmerica' | 'northAmerica' | 'africa' | 'asia' | 'oceania';

const ROWS: Record<Region, Row[]> = {
  // Europe
  europe: [
    ['ALB', 'Albania', '#e41e20 #000000', 'albanian'],
    ['AND', 'Andorra', '#10069f #fedf00 #d50032', 'spanish'],
    ['ARM', 'Armenia', '#d90012 #0033a0 #f2a800', 'caucasus'],
    ['AUT', 'Austria', '#ed2939 #ffffff', 'german'],
    ['AZE', 'Azerbaijan', '#0092bc #e4002b #00af66', 'turkish'],
    ['BLR', 'Belarus', '#c8313e #4aa657', 'eastslavic'],
    ['BEL', 'Belgium', '#ef3340 #fdda24 #000000', 'dutch'],
    ['BIH', 'Bosnia and Herzegovina', '#002395 #fecb00', 'balkan', 'Bosnia'],
    ['BUL', 'Bulgaria', '#00966e #ffffff #d62612', 'eastslavic'],
    ['CRO', 'Croatia', '#ff0000 #ffffff #171796', 'balkan'],
    ['CYP', 'Cyprus', '#d57800 #ffffff', 'greek'],
    ['CZE', 'Czechia', '#d7141a #ffffff #11457e', 'westslavic'],
    ['DEN', 'Denmark', '#c8102e #ffffff', 'nordic'],
    ['ENG', 'England', '#ce1124 #ffffff', 'anglo'],
    ['EST', 'Estonia', '#0072ce #000000 #ffffff', 'finnic'],
    ['FRO', 'Faroe Islands', '#005eb8 #ffffff #ef3340', 'nordic'],
    ['FIN', 'Finland', '#002f6c #ffffff', 'finnic'],
    ['FRA', 'France', '#002395 #ffffff #ed2939', 'french'],
    ['GEO', 'Georgia', '#ff0000 #ffffff', 'caucasus'],
    ['GER', 'Germany', '#dd0000 #000000 #ffce00', 'german'],
    ['GIB', 'Gibraltar', '#da000c #ffffff', 'anglo'],
    ['GRE', 'Greece', '#0d5eaf #ffffff', 'greek'],
    ['HUN', 'Hungary', '#ce2939 #ffffff #477050', 'hungarian'],
    ['ISL', 'Iceland', '#02529c #ffffff #dc1e35', 'nordic'],
    ['ISR', 'Israel', '#0038b8 #ffffff', 'israeli'],
    ['ITA', 'Italy', '#009246 #ffffff #ce2b37', 'italian'],
    ['KAZ', 'Kazakhstan', '#00afca #fec50c', 'centralasian'],
    ['KVX', 'Kosovo', '#244aa5 #d0a650', 'albanian'],
    ['LVA', 'Latvia', '#9e3039 #ffffff', 'baltic'],
    ['LIE', 'Liechtenstein', '#002b7f #ce1126', 'german'],
    ['LTU', 'Lithuania', '#fdb913 #006a44 #c1272d', 'baltic'],
    ['LUX', 'Luxembourg', '#ed2939 #ffffff #00a1de', 'french'],
    ['MLT', 'Malta', '#cf142b #ffffff', 'italian'],
    ['MDA', 'Moldova', '#003da5 #ffd100 #c8102e', 'romanian'],
    ['MNE', 'Montenegro', '#c40308 #d3ae3b', 'balkan'],
    ['NED', 'Netherlands', '#ae1c28 #ffffff #21468b', 'dutch'],
    ['MKD', 'North Macedonia', '#d20000 #ffe600', 'balkan', 'N. Macedonia'],
    ['NIR', 'Northern Ireland', '#00843d #ffffff', 'irish', 'N. Ireland'],
    ['NOR', 'Norway', '#ba0c2f #ffffff #00205b', 'nordic'],
    ['POL', 'Poland', '#dc143c #ffffff', 'westslavic'],
    ['POR', 'Portugal', '#046a38 #da291c', 'portuguese'],
    ['IRL', 'Republic of Ireland', '#169b62 #ffffff #ff883e', 'irish', 'Ireland'],
    ['ROU', 'Romania', '#002b7f #fcd116 #ce1126', 'romanian'],
    ['SMR', 'San Marino', '#5eb6e4 #ffffff', 'italian'],
    ['SCO', 'Scotland', '#005eb8 #ffffff', 'scottish'],
    ['SRB', 'Serbia', '#c6363c #0c4076 #ffffff', 'balkan'],
    ['SVK', 'Slovakia', '#0b4ea2 #ffffff #ee1c25', 'westslavic'],
    ['SVN', 'Slovenia', '#005da4 #ffffff #ed1c24', 'balkan'],
    ['ESP', 'Spain', '#aa151b #f1bf00', 'spanish'],
    ['SWE', 'Sweden', '#006aa7 #fecc00', 'nordic'],
    ['SUI', 'Switzerland', '#da291c #ffffff', 'german'],
    ['TUR', 'Turkey', '#e30a17 #ffffff', 'turkish'],
    ['UKR', 'Ukraine', '#0057b7 #ffd700', 'eastslavic'],
    ['WAL', 'Wales', '#c8102e #ffffff #00b140', 'welsh'],
  ],
  // South America
  southAmerica: [
    ['ARG', 'Argentina', '#74acdf #ffffff', 'latam'],
    ['BOL', 'Bolivia', '#d52b1e #f9e300 #007934', 'latam'],
    ['BRA', 'Brazil', '#009c3b #ffdf00 #002776', 'brazilian'],
    ['CHI', 'Chile', '#d52b1e #ffffff #0039a6', 'latam'],
    ['COL', 'Colombia', '#fcd116 #003893 #ce1126', 'latam'],
    ['ECU', 'Ecuador', '#ffdd00 #034ea2 #ed1c24', 'latam'],
    ['PAR', 'Paraguay', '#d52b1e #ffffff #0038a8', 'latam'],
    ['PER', 'Peru', '#d91023 #ffffff', 'latam'],
    ['URU', 'Uruguay', '#0038a8 #ffffff', 'latam'],
    ['VEN', 'Venezuela', '#cf142b #ffcc00 #00247d', 'latam'],
  ],
  // North and Central America and the Caribbean
  northAmerica: [
    ['AIA', 'Anguilla', '#012169 #ff9d00', 'caribbean'],
    ['ATG', 'Antigua and Barbuda', '#ce1126 #000000 #fcd116', 'caribbean', 'Antigua'],
    ['ARU', 'Aruba', '#418fde #ffd100', 'dutch'],
    ['BAH', 'Bahamas', '#00abc9 #fae042 #000000', 'caribbean'],
    ['BRB', 'Barbados', '#00267f #ffc726', 'caribbean'],
    ['BLZ', 'Belize', '#003f87 #ce1126', 'caribbean'],
    ['BER', 'Bermuda', '#c8102e #ffffff', 'caribbean'],
    ['VGB', 'British Virgin Islands', '#012169 #00843d', 'caribbean', 'BVI'],
    ['CAN', 'Canada', '#d80621 #ffffff', 'anglo'],
    ['CAY', 'Cayman Islands', '#012169 #c8102e', 'caribbean', 'Cayman Is.'],
    ['CRC', 'Costa Rica', '#002b7f #ffffff #ce1126', 'latam'],
    ['CUB', 'Cuba', '#002a8f #ffffff #cf142b', 'latam'],
    ['CUW', 'Curaçao', '#002b7f #f9e814', 'dutch'],
    ['DMA', 'Dominica', '#006b3f #fcd116 #d41c30', 'caribbean'],
    ['DOM', 'Dominican Republic', '#002d62 #ffffff #ce1126', 'latam', 'Dominican Rep.'],
    ['SLV', 'El Salvador', '#0047ab #ffffff', 'latam'],
    ['GRN', 'Grenada', '#ce1126 #fcd116 #007a5e', 'caribbean'],
    ['GUA', 'Guatemala', '#4997d0 #ffffff', 'latam'],
    ['GUY', 'Guyana', '#009e49 #fcd116 #ce1126', 'caribbean'],
    ['HAI', 'Haiti', '#00209f #d21034', 'french'],
    ['HON', 'Honduras', '#0073cf #ffffff', 'latam'],
    ['JAM', 'Jamaica', '#009b3a #fed100 #000000', 'caribbean'],
    ['MEX', 'Mexico', '#006847 #ffffff #ce1126', 'latam'],
    ['MSR', 'Montserrat', '#012169 #00a2bd', 'caribbean'],
    ['NCA', 'Nicaragua', '#0067c6 #ffffff', 'latam'],
    ['PAN', 'Panama', '#da121a #ffffff #072357', 'latam'],
    ['PUR', 'Puerto Rico', '#ed0000 #ffffff #0050f0', 'latam'],
    ['SKN', 'Saint Kitts and Nevis', '#009e49 #fcd116 #ce1126', 'caribbean', 'St Kitts'],
    ['LCA', 'Saint Lucia', '#66ccff #fcd116 #000000', 'caribbean', 'St Lucia'],
    ['VIN', 'Saint Vincent and the Grenadines', '#0072c6 #fcd116 #009e60', 'caribbean', 'St Vincent'],
    ['SUR', 'Suriname', '#377e3f #ffffff #b40a2d', 'dutch'],
    ['TRI', 'Trinidad and Tobago', '#ce1126 #000000 #ffffff', 'caribbean', 'Trinidad'],
    ['TCA', 'Turks and Caicos Islands', '#012169 #fcd116', 'caribbean', 'Turks & Caicos'],
    ['USA', 'United States', '#b22234 #ffffff #3c3b6e', 'anglo', 'USA'],
    ['VIR', 'US Virgin Islands', '#0f5ba7 #fcd116', 'caribbean', 'USVI'],
  ],
  // Africa
  africa: [
    ['ALG', 'Algeria', '#006233 #ffffff #d21034', 'arabic'],
    ['ANG', 'Angola', '#cc092f #000000 #ffcb00', 'portuguese'],
    ['BEN', 'Benin', '#008751 #fcd116 #e8112d', 'westafricanFr'],
    ['BOT', 'Botswana', '#75aadb #000000 #ffffff', 'southernAfrican'],
    ['BFA', 'Burkina Faso', '#ef2b2d #009e49 #fcd116', 'westafricanFr'],
    ['BDI', 'Burundi', '#ce1126 #ffffff #1eb53a', 'eastafrican'],
    ['CMR', 'Cameroon', '#007a5e #ce1126 #fcd116', 'westafricanFr'],
    ['CPV', 'Cape Verde', '#003893 #ffffff #cf2027', 'portuguese'],
    ['CTA', 'Central African Republic', '#003082 #ffffff #289728', 'westafricanFr', 'CAR'],
    ['CHA', 'Chad', '#002664 #fecb00 #c60c30', 'westafricanFr'],
    ['COM', 'Comoros', '#3a75c4 #ffc61e #ce1126', 'westafricanFr'],
    ['CGO', 'Congo', '#009543 #fbde4a #dc241f', 'westafricanFr'],
    ['COD', 'DR Congo', '#007fff #f7d618 #ce1021', 'westafricanFr'],
    ['DJI', 'Djibouti', '#6ab2e7 #ffffff #12ad2b', 'arabic'],
    ['EGY', 'Egypt', '#ce1126 #ffffff #000000', 'arabic'],
    ['EQG', 'Equatorial Guinea', '#3e9a00 #ffffff #e32118', 'westafricanFr', 'Eq. Guinea'],
    ['ERI', 'Eritrea', '#418fde #ea0437 #12ad2b', 'eastafrican'],
    ['SWZ', 'Eswatini', '#3e5eb9 #ffd900 #b10c0c', 'southernAfrican'],
    ['ETH', 'Ethiopia', '#078930 #fcdd09 #da121a', 'eastafrican'],
    ['GAB', 'Gabon', '#009e60 #fcd116 #3a75c4', 'westafricanFr'],
    ['GAM', 'Gambia', '#ce1126 #0c1c8c #3a7728', 'westafricanEn'],
    ['GHA', 'Ghana', '#ce1126 #fcd116 #006b3f', 'westafricanEn'],
    ['GUI', 'Guinea', '#ce1126 #fcd116 #009460', 'westafricanFr'],
    ['GNB', 'Guinea-Bissau', '#ce1126 #fcd116 #009e49', 'portuguese'],
    ['CIV', 'Ivory Coast', '#f77f00 #ffffff #009e60', 'westafricanFr'],
    ['KEN', 'Kenya', '#bb0000 #000000 #006600', 'eastafrican'],
    ['LES', 'Lesotho', '#00209f #ffffff #009543', 'southernAfrican'],
    ['LBR', 'Liberia', '#bf0a30 #ffffff #002868', 'westafricanEn'],
    ['LBY', 'Libya', '#e70013 #000000 #239e46', 'arabic'],
    ['MAD', 'Madagascar', '#fc3d32 #ffffff #007e3a', 'westafricanFr'],
    ['MWI', 'Malawi', '#ce1126 #000000 #339e35', 'southernAfrican'],
    ['MLI', 'Mali', '#14b53a #fcd116 #ce1126', 'westafricanFr'],
    ['MTN', 'Mauritania', '#006233 #ffc400 #d01c1f', 'arabic'],
    ['MRI', 'Mauritius', '#ea2839 #1a206d #ffd500', 'southAsian'],
    ['MAR', 'Morocco', '#c1272d #006233', 'arabic'],
    ['MOZ', 'Mozambique', '#007168 #fce100 #d21034', 'portuguese'],
    ['NAM', 'Namibia', '#003580 #d21034 #009543', 'southernAfrican'],
    ['NIG', 'Niger', '#e05206 #ffffff #0db02b', 'westafricanFr'],
    ['NGA', 'Nigeria', '#008751 #ffffff', 'westafricanEn'],
    ['RWA', 'Rwanda', '#00a1de #fad201 #20603d', 'eastafrican'],
    ['STP', 'São Tomé and Príncipe', '#12ad2b #ffce00 #d21034', 'portuguese', 'São Tomé'],
    ['SEN', 'Senegal', '#00853f #fdef42 #e31b23', 'westafricanFr'],
    ['SEY', 'Seychelles', '#003f87 #fcd856 #d62828', 'southernAfrican'],
    ['SLE', 'Sierra Leone', '#1eb53a #ffffff #0072c6', 'westafricanEn'],
    ['SOM', 'Somalia', '#4189dd #ffffff', 'eastafrican'],
    ['RSA', 'South Africa', '#007a4d #ffb612 #de3831', 'southernAfrican'],
    ['SSD', 'South Sudan', '#078930 #000000 #da121a', 'eastafrican'],
    ['SDN', 'Sudan', '#d21034 #ffffff #007229', 'arabic'],
    ['TAN', 'Tanzania', '#1eb53a #fcd116 #00a3dd', 'eastafrican'],
    ['TOG', 'Togo', '#006a4e #ffce00 #d21034', 'westafricanFr'],
    ['TUN', 'Tunisia', '#e70013 #ffffff', 'arabic'],
    ['UGA', 'Uganda', '#fcdc04 #000000 #d90000', 'eastafrican'],
    ['ZAM', 'Zambia', '#198a00 #ef7d00 #de2010', 'southernAfrican'],
    ['ZIM', 'Zimbabwe', '#006400 #ffd200 #d40000', 'southernAfrican'],
  ],
  // Asia
  asia: [
    ['AFG', 'Afghanistan', '#d32011 #000000 #007a36', 'persian'],
    ['AUS', 'Australia', '#00843d #ffcd00', 'anglo'],
    ['BHR', 'Bahrain', '#ce1126 #ffffff', 'arabic'],
    ['BAN', 'Bangladesh', '#006a4e #f42a41', 'southAsian'],
    ['BHU', 'Bhutan', '#ffd520 #ff4e12', 'southAsian'],
    ['BRU', 'Brunei', '#f7e017 #000000 #ffffff', 'malay'],
    ['CAM', 'Cambodia', '#032ea1 #e00025', 'thai'],
    ['CHN', 'China', '#ee1c25 #ffff00', 'chinese'],
    ['TPE', 'Chinese Taipei', '#fe0000 #000095 #ffffff', 'chinese'],
    ['GUM', 'Guam', '#00297b #c62139', 'filipino'],
    ['HKG', 'Hong Kong', '#de2910 #ffffff', 'chinese'],
    ['IND', 'India', '#ff9933 #ffffff #138808', 'southAsian'],
    ['IDN', 'Indonesia', '#ce1126 #ffffff', 'malay'],
    ['IRN', 'Iran', '#239f40 #ffffff #da0000', 'persian'],
    ['IRQ', 'Iraq', '#ce1126 #ffffff #000000', 'arabic'],
    ['JPN', 'Japan', '#bc002d #ffffff', 'japanese'],
    ['JOR', 'Jordan', '#007a3d #000000 #ce1126', 'arabic'],
    ['KUW', 'Kuwait', '#007a3d #ffffff #ce1126', 'arabic'],
    ['KGZ', 'Kyrgyzstan', '#e8112d #ffef00', 'centralasian'],
    ['LAO', 'Laos', '#002868 #ce1126', 'thai'],
    ['LBN', 'Lebanon', '#ed1c24 #ffffff #00a651', 'arabic'],
    ['MAC', 'Macau', '#00785e #ffffff', 'chinese'],
    ['MAS', 'Malaysia', '#cc0001 #010066 #ffcc00', 'malay'],
    ['MDV', 'Maldives', '#d21034 #007e3a', 'southAsian'],
    ['MNG', 'Mongolia', '#c4272f #015197', 'burmese'],
    ['MYA', 'Myanmar', '#fecb00 #34b233 #ea2839', 'burmese'],
    ['NEP', 'Nepal', '#dc143c #003893', 'southAsian'],
    ['PRK', 'North Korea', '#024fa2 #ed1c27', 'korean'],
    ['OMA', 'Oman', '#db161b #ffffff #008000', 'arabic'],
    ['PAK', 'Pakistan', '#01411c #ffffff', 'southAsian'],
    ['PLE', 'Palestine', '#007a3d #ffffff #ce1126', 'arabic'],
    ['PHI', 'Philippines', '#0038a8 #ce1126 #fcd116', 'filipino'],
    ['QAT', 'Qatar', '#8a1538 #ffffff', 'arabic'],
    ['KSA', 'Saudi Arabia', '#006c35 #ffffff', 'arabic'],
    ['SIN', 'Singapore', '#ef3340 #ffffff', 'malay'],
    ['KOR', 'South Korea', '#cd2e3a #ffffff #0047a0', 'korean'],
    ['SRI', 'Sri Lanka', '#8d153a #ffb700', 'southAsian'],
    ['SYR', 'Syria', '#ce1126 #ffffff #000000', 'arabic'],
    ['TJK', 'Tajikistan', '#cc0000 #ffffff #006600', 'persian'],
    ['THA', 'Thailand', '#a51931 #f4f5f8 #2d2a4a', 'thai'],
    ['TLS', 'Timor-Leste', '#dc241f #ffc726 #000000', 'portuguese'],
    ['TKM', 'Turkmenistan', '#00843d #d22630', 'centralasian'],
    ['UAE', 'United Arab Emirates', '#00732f #ffffff #ff0000', 'arabic', 'UAE'],
    ['UZB', 'Uzbekistan', '#0099b5 #ffffff #1eb53a', 'centralasian'],
    ['VIE', 'Vietnam', '#da251d #ffff00', 'vietnamese'],
    ['YEM', 'Yemen', '#ce1126 #ffffff #000000', 'arabic'],
  ],
  // Oceania
  oceania: [
    ['ASA', 'American Samoa', '#002b7f #bf0a30 #ffffff', 'pacific'],
    ['COK', 'Cook Islands', '#00247d #ffffff', 'pacific'],
    ['FIJ', 'Fiji', '#68bfe5 #ffffff #ce1126', 'pacific'],
    ['NCL', 'New Caledonia', '#0035ad #ed4135 #009543', 'french'],
    ['NZL', 'New Zealand', '#00247d #ffffff', 'anglo'],
    ['PNG', 'Papua New Guinea', '#ce1126 #000000 #fcd116', 'pacific', 'PNG'],
    ['SAM', 'Samoa', '#ce1126 #002b7f', 'pacific'],
    ['SOL', 'Solomon Islands', '#0051ba #fcd116 #215b33', 'pacific', 'Solomon Is.'],
    ['TAH', 'Tahiti', '#ce1126 #ffffff', 'french'],
    ['TGA', 'Tonga', '#c10000 #ffffff', 'pacific'],
    ['VAN', 'Vanuatu', '#d21034 #009543 #fdce12', 'pacific'],
  ],
};

/** Every playable nation: FIFA's members, leaving out any currently banned from international football. */
export const NATIONS: Nation[] = (Object.entries(ROWS) as [Region, Row[]][]).flatMap(([region, rows]) =>
  rows.map(([code, name, colours, names, shortName]) => ({ code, name, region, colours: colours.split(' '), names, ...(shortName ? { shortName } : {}) })),
);

/**
 * Teams in other sports that aren't FIFA members, so not playable at football:
 * the West Indies cricket side and Jersey.
 */
export const EXTRA_NATIONS: Nation[] = [
  { code: 'WIN', name: 'West Indies', colours: ['#7b0041', '#ffc72c'], region: 'northAmerica', names: 'caribbean' },
  { code: 'JER', name: 'Jersey', colours: ['#ce1126', '#ffffff'], region: 'europe', names: 'anglo' },
];
export const EXTRA_LOCATIONS: Record<string, [number, number]> = { WIN: [13.1, -59.6], JER: [49.2, -2.1] };

/**
 * Each nation's one rival, the fixture its fans care about most. One-way
 * where it is in real life: Scotland and Wales both have England, but
 * England has Germany.
 */
export const RIVALS: Record<string, string> = {
  // Europe
  ALB: 'SRB', AND: 'ESP', ARM: 'AZE', AUT: 'GER', AZE: 'ARM', BLR: 'POL', BEL: 'NED', BIH: 'CRO', BUL: 'ROU', CRO: 'SRB',
  CYP: 'GRE', CZE: 'SVK', DEN: 'SWE', ENG: 'GER', EST: 'LVA', FRO: 'ISL', FIN: 'SWE', FRA: 'ITA', GEO: 'ARM', GER: 'NED',
  GIB: 'ESP', GRE: 'TUR', HUN: 'AUT', ISL: 'NOR', ISR: 'CYP', ITA: 'GER', KAZ: 'UZB', KVX: 'ALB', LVA: 'EST', LIE: 'SUI',
  LTU: 'LVA', LUX: 'BEL', MLT: 'CYP', MDA: 'ROU', MNE: 'SRB', NED: 'GER', MKD: 'BUL', NIR: 'IRL', NOR: 'SWE', POL: 'GER',
  POR: 'ESP', IRL: 'ENG', ROU: 'HUN', SMR: 'ITA', SCO: 'ENG', SRB: 'CRO', SVK: 'CZE', SVN: 'CRO', ESP: 'POR', SWE: 'DEN',
  SUI: 'AUT', TUR: 'GRE', UKR: 'POL', WAL: 'ENG',
  // South America
  ARG: 'BRA', BOL: 'CHI', BRA: 'ARG', CHI: 'PER', COL: 'VEN', ECU: 'PER', PAR: 'BOL', PER: 'CHI', URU: 'ARG', VEN: 'COL',
  // North and Central America and the Caribbean
  AIA: 'MSR', ATG: 'SKN', ARU: 'CUW', BAH: 'BER', BRB: 'TRI', BLZ: 'GUA', BER: 'BAH', VGB: 'VIR', CAN: 'USA', CAY: 'JAM',
  CRC: 'HON', CUB: 'JAM', CUW: 'ARU', DMA: 'LCA', DOM: 'HAI', SLV: 'HON', GRN: 'VIN', GUA: 'SLV', GUY: 'SUR', HAI: 'JAM',
  HON: 'SLV', JAM: 'TRI', MEX: 'USA', MSR: 'AIA', NCA: 'CRC', PAN: 'CRC', PUR: 'CUB', SKN: 'ATG', LCA: 'DMA', VIN: 'GRN',
  SUR: 'GUY', TRI: 'JAM', TCA: 'BAH', USA: 'MEX', VIR: 'VGB',
  // Africa
  ALG: 'MAR', ANG: 'COD', BEN: 'TOG', BOT: 'RSA', BFA: 'CIV', BDI: 'RWA', CMR: 'NGA', CPV: 'SEN', CTA: 'CHA', CHA: 'CMR',
  COM: 'MAD', CGO: 'COD', COD: 'CGO', DJI: 'SOM', EGY: 'ALG', EQG: 'GAB', ERI: 'ETH', SWZ: 'LES', ETH: 'ERI', GAB: 'CMR',
  GAM: 'SEN', GHA: 'NGA', GUI: 'SEN', GNB: 'CPV', CIV: 'GHA', KEN: 'UGA', LES: 'RSA', LBR: 'SLE', LBY: 'EGY', MAD: 'MRI',
  MWI: 'ZAM', MLI: 'SEN', MTN: 'SEN', MRI: 'MAD', MAR: 'ALG', MOZ: 'ANG', NAM: 'BOT', NIG: 'NGA', NGA: 'GHA', RWA: 'BDI',
  STP: 'EQG', SEN: 'CIV', SEY: 'MRI', SLE: 'LBR', SOM: 'ETH', RSA: 'NGA', SSD: 'SDN', SDN: 'SSD', TAN: 'KEN', TOG: 'GHA',
  TUN: 'ALG', UGA: 'KEN', ZAM: 'ZIM', ZIM: 'ZAM',
  // Asia
  AFG: 'TJK', AUS: 'JPN', BHR: 'QAT', BAN: 'IND', BHU: 'NEP', BRU: 'MAS', CAM: 'THA', CHN: 'KOR', TPE: 'HKG', GUM: 'PHI',
  HKG: 'MAC', IND: 'PAK', IDN: 'MAS', IRN: 'IRQ', IRQ: 'IRN', JPN: 'KOR', JOR: 'IRQ', KUW: 'IRQ', KGZ: 'TJK', LAO: 'VIE',
  LBN: 'SYR', MAC: 'HKG', MAS: 'SIN', MDV: 'SRI', MNG: 'CHN', MYA: 'THA', NEP: 'IND', PRK: 'KOR', OMA: 'UAE', PAK: 'IND',
  PLE: 'JOR', PHI: 'IDN', QAT: 'KSA', KSA: 'IRN', SIN: 'MAS', KOR: 'JPN', SRI: 'MDV', SYR: 'LBN', TJK: 'KGZ', THA: 'VIE',
  TLS: 'IDN', TKM: 'UZB', UAE: 'QAT', UZB: 'KAZ', VIE: 'THA', YEM: 'OMA',
  // Oceania
  ASA: 'SAM', COK: 'NZL', FIJ: 'NCL', NCL: 'TAH', NZL: 'AUS', PNG: 'SOL', SAM: 'ASA', SOL: 'VAN', TAH: 'NCL', TGA: 'SAM',
  VAN: 'SOL',
};

/** Roughly where each nation is (its capital, latitude and longitude), for finding neighbours. */
export const LOCATIONS: Record<string, [number, number]> = {
  // Europe
  ALB: [41.3, 19.8], AND: [42.5, 1.5], ARM: [40.2, 44.5], AUT: [48.2, 16.4], AZE: [40.4, 49.9], BLR: [53.9, 27.6], BEL: [50.8, 4.4],
  BIH: [43.9, 18.4], BUL: [42.7, 23.3], CRO: [45.8, 16.0], CYP: [35.2, 33.4], CZE: [50.1, 14.4], DEN: [55.7, 12.6], ENG: [51.5, -0.1],
  EST: [59.4, 24.8], FRO: [62.0, -6.8], FIN: [60.2, 24.9], FRA: [48.9, 2.4], GEO: [41.7, 44.8], GER: [52.5, 13.4], GIB: [36.1, -5.4],
  GRE: [38.0, 23.7], HUN: [47.5, 19.0], ISL: [64.1, -21.9], ISR: [31.8, 35.2], ITA: [41.9, 12.5], KAZ: [51.2, 71.4], KVX: [42.7, 21.2],
  LVA: [56.9, 24.1], LIE: [47.1, 9.5], LTU: [54.7, 25.3], LUX: [49.6, 6.1], MLT: [35.9, 14.5], MDA: [47.0, 28.9], MNE: [42.4, 19.3],
  NED: [52.4, 4.9], MKD: [42.0, 21.4], NIR: [54.6, -5.9], NOR: [59.9, 10.8], POL: [52.2, 21.0], POR: [38.7, -9.1], IRL: [53.3, -6.3],
  ROU: [44.4, 26.1], SMR: [43.9, 12.4], SCO: [55.9, -3.2], SRB: [44.8, 20.5], SVK: [48.1, 17.1], SVN: [46.1, 14.5], ESP: [40.4, -3.7],
  SWE: [59.3, 18.1], SUI: [46.9, 7.4], TUR: [39.9, 32.9], UKR: [50.5, 30.5], WAL: [51.5, -3.2],
  // South America
  ARG: [-34.6, -58.4], BOL: [-16.5, -68.1], BRA: [-15.8, -47.9], CHI: [-33.4, -70.7], COL: [4.7, -74.1], ECU: [-0.2, -78.5],
  PAR: [-25.3, -57.6], PER: [-12.0, -77.0], URU: [-34.9, -56.2], VEN: [10.5, -66.9],
  // North and Central America and the Caribbean
  AIA: [18.2, -63.1], ATG: [17.1, -61.8], ARU: [12.5, -70.0], BAH: [25.0, -77.3], BRB: [13.1, -59.6], BLZ: [17.3, -88.8],
  BER: [32.3, -64.8], VGB: [18.4, -64.6], CAN: [45.4, -75.7], CAY: [19.3, -81.4], CRC: [9.9, -84.1], CUB: [23.1, -82.4],
  CUW: [12.1, -68.9], DMA: [15.3, -61.4], DOM: [18.5, -69.9], SLV: [13.7, -89.2], GRN: [12.1, -61.7], GUA: [14.6, -90.5],
  GUY: [6.8, -58.2], HAI: [18.5, -72.3], HON: [14.1, -87.2], JAM: [18.0, -76.8], MEX: [19.4, -99.1], MSR: [16.7, -62.2],
  NCA: [12.1, -86.3], PAN: [9.0, -79.5], PUR: [18.5, -66.1], SKN: [17.3, -62.7], LCA: [14.0, -61.0], VIN: [13.2, -61.2],
  SUR: [5.9, -55.2], TRI: [10.7, -61.5], TCA: [21.5, -71.1], USA: [38.9, -77.0], VIR: [18.3, -64.9],
  // Africa
  ALG: [36.8, 3.1], ANG: [-8.8, 13.2], BEN: [6.5, 2.6], BOT: [-24.7, 25.9], BFA: [12.4, -1.5], BDI: [-3.4, 29.4], CMR: [3.9, 11.5],
  CPV: [14.9, -23.5], CTA: [4.4, 18.6], CHA: [12.1, 15.0], COM: [-11.7, 43.3], CGO: [-4.3, 15.3], COD: [-4.3, 15.3], DJI: [11.6, 43.1],
  EGY: [30.0, 31.2], EQG: [3.8, 8.8], ERI: [15.3, 38.9], SWZ: [-26.3, 31.1], ETH: [9.0, 38.7], GAB: [0.4, 9.5], GAM: [13.5, -16.6],
  GHA: [5.6, -0.2], GUI: [9.6, -13.6], GNB: [11.9, -15.6], CIV: [5.4, -4.0], KEN: [-1.3, 36.8], LES: [-29.3, 27.5], LBR: [6.3, -10.8],
  LBY: [32.9, 13.2], MAD: [-18.9, 47.5], MWI: [-14.0, 33.8], MLI: [12.6, -8.0], MTN: [18.1, -16.0], MRI: [-20.2, 57.5], MAR: [34.0, -6.8],
  MOZ: [-25.9, 32.6], NAM: [-22.6, 17.1], NIG: [13.5, 2.1], NGA: [9.1, 7.5], RWA: [-1.9, 30.1], STP: [0.3, 6.7], SEN: [14.7, -17.4],
  SEY: [-4.6, 55.5], SLE: [8.5, -13.2], SOM: [2.0, 45.3], RSA: [-25.7, 28.2], SSD: [4.9, 31.6], SDN: [15.6, 32.5], TAN: [-6.8, 39.3],
  TOG: [6.1, 1.2], TUN: [36.8, 10.2], UGA: [0.3, 32.6], ZAM: [-15.4, 28.3], ZIM: [-17.8, 31.0],
  // Asia
  AFG: [34.5, 69.2], AUS: [-35.3, 149.1], BHR: [26.2, 50.6], BAN: [23.8, 90.4], BHU: [27.5, 89.6], BRU: [4.9, 114.9], CAM: [11.6, 104.9],
  CHN: [39.9, 116.4], TPE: [25.0, 121.6], GUM: [13.5, 144.8], HKG: [22.3, 114.2], IND: [28.6, 77.2], IDN: [-6.2, 106.8], IRN: [35.7, 51.4],
  IRQ: [33.3, 44.4], JPN: [35.7, 139.7], JOR: [31.9, 35.9], KUW: [29.4, 48.0], KGZ: [42.9, 74.6], LAO: [18.0, 102.6], LBN: [33.9, 35.5],
  MAC: [22.2, 113.5], MAS: [3.1, 101.7], MDV: [4.2, 73.5], MNG: [47.9, 106.9], MYA: [19.8, 96.1], NEP: [27.7, 85.3], PRK: [39.0, 125.8],
  OMA: [23.6, 58.4], PAK: [33.7, 73.1], PLE: [31.9, 35.2], PHI: [14.6, 121.0], QAT: [25.3, 51.5], KSA: [24.7, 46.7], SIN: [1.3, 103.8],
  KOR: [37.6, 127.0], SRI: [6.9, 79.9], SYR: [33.5, 36.3], TJK: [38.6, 68.8], THA: [13.8, 100.5], TLS: [-8.6, 125.6], TKM: [37.9, 58.4],
  UAE: [24.5, 54.4], UZB: [41.3, 69.2], VIE: [21.0, 105.8], YEM: [15.4, 44.2],
  // Oceania
  ASA: [-14.3, -170.7], COK: [-21.2, -159.8], FIJ: [-18.1, 178.4], NCL: [-22.3, 166.5], NZL: [-41.3, 174.8], PNG: [-9.4, 147.2],
  SAM: [-13.8, -171.8], SOL: [-9.4, 160.0], TAH: [-17.5, -149.6], TGA: [-21.1, -175.2], VAN: [-17.7, 168.3],
};

/**
 * The 100 nations in the world, strongest first, by football standing (titles,
 * consistency over the last decade, current form), not a single ranking table.
 * Starting pots are cut from this order.
 */
export const WORLD_ORDER: string[] = [
  ...['ESP', 'ARG', 'FRA', 'BRA', 'ENG', 'GER', 'POR', 'NED'],
  ...['ITA', 'BEL', 'MAR', 'CRO', 'URU', 'MEX', 'COL', 'SUI'],
  ...['USA', 'JPN', 'DEN', 'SEN', 'NOR', 'AUT', 'ECU', 'KOR'],
  ...['IRN', 'TUR', 'SWE', 'SRB', 'POL', 'NGA', 'UKR', 'CHI', 'PAR', 'SCO', 'CZE', 'AUS'],
  ...['EGY', 'CMR', 'CIV', 'ALG', 'PER', 'GHA', 'WAL', 'HUN'],
  ...['GRE', 'IRL', 'ROU', 'TUN', 'KSA', 'CRC', 'CAN', 'SVK', 'SVN', 'BUL', 'RSA', 'VEN'],
  ...['BIH', 'MLI', 'ISL', 'FIN', 'NIR', 'QAT', 'JAM', 'PAN'],
  ...['ALB', 'MKD', 'GEO', 'ISR', 'BOL', 'COD', 'BFA', 'HON', 'UZB', 'IRQ', 'UAE', 'MNE'],
  ...['ZAM', 'CPV', 'CHN', 'GUI', 'GAB', 'ANG', 'JOR', 'NZL'],
  ...['SLV', 'TRI', 'HAI', 'OMA', 'EST', 'LVA', 'LTU', 'LUX'],
  ...['CYP', 'ARM', 'FRO', 'THA', 'VIE', 'IND', 'MLT', 'SMR'],
];
