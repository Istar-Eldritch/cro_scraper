import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import { readFileSync , writeFileSync, existsSync } from 'fs';
import { CROIndex } from './cro_index';

const BASE = 'http://www.contractresearchmap.com';

interface Link {
  name: string;
  origin?: Link;
  link_type: 'base' | 'country' | 'state' | 'cro';
  type: 'link';
  href: string;
}

function isLink(o: any): o is Link {
  return o && o.type === 'link';
}

interface CRO {
  name: string;
  type: 'cro_info';
  website: string;
  descriptions: string[];
}

function isCRO(o: any): o is CRO {
  return o && o.type === 'cro_info';
}

// function wait(n: number): Promise<void> {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve();
//     }, n);
//   });
// }

const start = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ["--no-sandbox"],
    defaultViewport: {
      width: 1366,
      height: 768,
    },
  });

  const scraper = new Scraper(browser);

  let links: Array<Link | CRO> = [{
    href: BASE,
    name: 'BASE',
    link_type: 'base' as 'base',
    type: 'link',
  }];

  const cro_index = new CROIndex();

  while (links.length > 0) {
    const to_extract = links.slice(0, 4);
    links = links.slice(4);

    await Promise.all(to_extract.map(async (next) => {
      try {
        if (isLink(next)) {
          const href = next.link_type === 'base' || next.href.includes('http') ? next.href : `${BASE}${next.href}`;
          let scraped: Array<Link | CRO> = [];
          if (['base', 'country', 'state'].indexOf(next.link_type) > -1) {
            const scraped_links = await scraper.scrape_list(href);
            scraped = scraped_links.map((link) => {
              link.origin = next;
              return link;
            });
          } else {
            // CRO scrape
            const country = getCountryId(next);
            const cro = await scraper.scrape_cro(href);
            try {
              cro_index.insert({...cro, country});
            } catch (err) {
              // Ignore
            }
          }
          links = [...scraped, ...links];
        } else if (isCRO(next)) {
          console.log(`ToImplement ${next.website}`);
        }
      } catch (err) {
        console.error(`Failure`, err, next);
      }
    }));

    process.stdout.write('.');
  }

  scraper.persist_memory();
  writeFileSync('cro.json', JSON.stringify(cro_index));

  console.log(`Scraped ${scraper.counter} pages`);
};

function getCountryId(link: Link): string {
  if (link.link_type === 'country') {
    return link.name.toLocaleLowerCase().split(' ').join('_');
  } else if (link.origin) {
    return getCountryId(link.origin);
  } else {
    throw new Error('Could not extract country from link chain');
  }
}

class Scraper {
  public counter: number;
  private browser: Browser;
  private memory: {[k: string]: Array<CRO | Link>};

  constructor(browser: Browser) {
    this.counter = 0;
    this.browser = browser;
    if (existsSync('memory.json')) {
      this.memory = JSON.parse(readFileSync('memory.json').toString());
    } else {
      this.memory = {};
    }
  }

  public async scrape_list(url: string): Promise<Link[]> {
    if (this.memory[url]) {
      return this.memory[url] as Link[];
    }
    try {
      const page = await this.browser.newPage();

      await page.goto(url);

      const links = await page.$$eval(".media-heading", (list) =>
        list.map((li) => {
          const header = (li.textContent || '').trim().split('\n').map((t) => t.trim());
          let link_type: 'cro' | 'country';
          if (header[1] === 'country' || header[1] === 'state') {
            link_type = header[1] as 'country';
          } else {
            link_type = 'cro';
          }
          return {
            name: header[0] || '',
            type: 'link' as 'link',
            link_type,
            href: li.children[1].getAttribute('href') || '',
          };
        }));

      this.memory[url] = links;
      await page.close();
      this.counter = this.counter + 1;
      if (this.counter % 100 === 0) {
        this.persist_memory();
      }
      return links;
    } catch (err) {
      console.error(err);
      return Promise.reject(err);
    }
  }

  public async scrape_cro(url: string): Promise<CRO> {
    if (this.memory[url]) {
      const existing = this.memory[url][0];
      if (isCRO(existing)) {
        return existing;
      }
    }
    const page = await this.browser.newPage();

    await page.goto(url);

    const cro_base: CRO = {
      name: '',
      type: 'cro_info',
      website: '',
      descriptions: [],
    };

    const name = await page.$eval('.panel-heading', (heading) => (heading.textContent || '').trim());
    const description = await page.$eval('.tab-content', (content) => (content.textContent || '').trim());

    const sections = await page.$$eval(".text-muted.uppercase", (list) => {
      return list.map((tr) => {
        const value_element = (tr.parentElement as Element).children[2];
        let value: string;
        if (value_element) {
          const link = value_element.getAttribute('href');
          value = link ? link : (value_element.textContent || '');
        } else {
          value = ((tr.parentElement as Element).textContent || '').split('\n').filter((line) => line.length > 0)[1];
        }
        const category = (tr.textContent || '').toLowerCase().split(' ').join('_').split(':').join('');
        return {
          [category]: value,
        };
      });
    });

    const cro = sections.reduce((acc, section) => ({...acc, ...section}), cro_base);
    cro.name = name;
    cro.descriptions.push(description);

    this.memory[url] = [cro];
    await page.close();
    this.counter = this.counter + 1;
    if (this.counter % 100 === 0) {
      this.persist_memory();
    }
    return cro;
  }

  public persist_memory(): void {
    console.log('\nPersisting state...');
    writeFileSync('memory.json', JSON.stringify(this.memory));
    console.log('State persisted!');
  }
}

start();
