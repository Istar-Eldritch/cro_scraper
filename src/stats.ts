import { LocatedCRO } from './cro_index';
import { readFileSync, writeFileSync } from 'fs';

const db = JSON.parse(readFileSync('cro.json').toString());

function filter_country(cros: LocatedCRO[], ...countries: string[]): LocatedCRO[] {
  return cros.filter((cro) => {
    return countries.indexOf(cro.country) > -1;
  });
}

function filter_keywords(cros: LocatedCRO[], ...keywords: string[]): LocatedCRO[] {
  return cros.filter((cro) => {
    const text = cro.descriptions.join(' ').toLocaleLowerCase() + ' ' + cro.name.toLocaleLowerCase();
    return keywords.reduce((acc, keyword) => {
      return acc || text.includes(keyword);
    }, false);
  });
}

function country_stats(cros: LocatedCRO[]): Array<[string, number]> {
  const values = Object.entries(cros.reduce((acc, cro: LocatedCRO) => {
    const country = cro.country;
    if (Number.isInteger(acc[country])) {
      acc[country]  = acc[country] + 1;
    } else {
      acc[country] = 1;
    }
    return acc;
  }, {} as {[k: string]: number}));

  return values;
}

function toCSV(cros: LocatedCRO[]): string {
  return cros.reduce((acc, cro) => {
    return acc + `${cro.name},${cro.website},${cro.country}\r\n`;
  }, 'data:text/csv;charset=utf-8,');
}

const cro_list: LocatedCRO[] = Object.values(db);
const country_filtered = filter_country(cro_list, 'united_states', 'united_kingdom', 'germany', 'canada');

const keyword_filtered = filter_keywords(
  country_filtered,
  'oncology', 'cancer', 'tumour',
  'immuno-oncology', 'preclinical', 'pre-clinical');

const sorted_country_stats = country_stats(keyword_filtered)
  .sort((firstEl, secondEl) => secondEl[1] - firstEl[1]);

const countryStats = sorted_country_stats.reduce((acc, [country, num]) => {
  return acc + `
    ${country}: ${num}`;
}, '');

console.log(`Total: ${keyword_filtered.length}`);

console.log(`By Country: ${countryStats}`);

writeFileSync('cro.csv', toCSV(keyword_filtered));
