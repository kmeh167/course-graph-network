const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class CourseScraper {
  constructor(baseUrl = 'https://catalog.illinois.edu/courses-of-instruction/') {
    this.baseUrl = baseUrl;
    this.courses = [];
  }

  async fetchPage(url) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      return null;
    }
  }

  parsePrerequisitesAndCorequisites($descBlock) {
    const prerequisites = [];
    const corequisites = [];

    const descText = $descBlock.text();

    const prereqIndex = descText.indexOf('Prerequisite:');
    if (prereqIndex === -1) {
      return { prerequisites, corequisites };
    }

    const prereqSection = descText.substring(prereqIndex);
    const isConcurrentRegistration = prereqSection.toLowerCase().includes('concurrent registration');

    $descBlock.find('a').each((i, elem) => {
      const $link = cheerio.load(elem);
      const linkText = $link.text().trim();

      const courseMatch = linkText.match(/([A-Z]{2,4})\s*(\d{3})/);

      if (courseMatch) {
        const courseName = `${courseMatch[1]} ${courseMatch[2]}`;

        const linkPosition = prereqSection.indexOf(linkText);
        if (linkPosition !== -1) {
          const contextStart = Math.max(0, linkPosition - 50);
          const contextEnd = Math.min(prereqSection.length, linkPosition + linkText.length + 50);
          const context = prereqSection.substring(contextStart, contextEnd).toLowerCase();

          if (context.includes('concurrent') && isConcurrentRegistration) {
            if (!corequisites.includes(courseName)) {
              corequisites.push(courseName);
            }
          } else {
            if (!prerequisites.includes(courseName)) {
              prerequisites.push(courseName);
            }
          }
        }
      }
    });

    return { prerequisites, corequisites };
  }

  async scrapeDepartmentList() {
    console.log('Fetching department list...');
    const html = await this.fetchPage(this.baseUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const departments = [];

    $('#atozindex a').each((i, elem) => {
      const href = $(elem).attr('href');
      const name = $(elem).text().trim();
      if (href && name) {
        const pathParts = href.split('/').filter(x => x);
        const courseCode = pathParts[pathParts.length - 1];
        departments.push({
          name: name,
          code: courseCode.toUpperCase(),
          url: `https://catalog.illinois.edu${href}`
        });
      }
    });

    console.log(`Found ${departments.length} departments`);
    return departments;
  }

  async scrapeDepartmentCourses(departmentUrl, departmentCode) {
    console.log(`Scraping courses from ${departmentCode}...`);
    const html = await this.fetchPage(departmentUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const courses = [];

    $('#courseinventorycontainer .courses .courseblock').each((i, elem) => {
      const $block = $(elem);

      const $title = $block.find('.courseblocktitle');
      const titleText = $title.text().trim();

      const courseNumberMatch = titleText.match(/(\d{3})\./);
      if (!courseNumberMatch) return;

      const courseNumber = courseNumberMatch[1];
      const courseCode = `${departmentCode} ${courseNumber}`;

      const courseName = titleText
        .replace(/^.*?\d{3}\.\s*/, '')
        .replace(/\s*credit:.*$/i, '')
        .trim();

      const $desc = $block.find('.courseblockdesc');
      const description = $desc.text().trim();

      const { prerequisites, corequisites } = this.parsePrerequisitesAndCorequisites($desc);

      courses.push({
        code: courseCode,
        name: courseName,
        department: departmentCode,
        description: description,
        prerequisites: prerequisites,
        corequisites: corequisites,
        url: departmentUrl
      });
    });

    console.log(`  Found ${courses.length} courses`);
    return courses;
  }

  async scrapeAll(limit = null) {
    const departments = await this.scrapeDepartmentList();
    const departmentsToScrape = limit ? departments.slice(0, limit) : departments;

    for (const dept of departmentsToScrape) {
      const courses = await this.scrapeDepartmentCourses(dept.url, dept.code);
      this.courses.push(...courses);

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\nTotal courses scraped: ${this.courses.length}`);
    return this.courses;
  }

  async saveToFile(filename = 'courses.json') {
    const dataDir = path.join(__dirname, '../../data');
    await fs.mkdir(dataDir, { recursive: true });

    const filepath = path.join(dataDir, filename);
    await fs.writeFile(filepath, JSON.stringify(this.courses, null, 2));
    console.log(`Data saved to ${filepath}`);
  }
}

if (require.main === module) {
  (async () => {
    const scraper = new CourseScraper();
    await scraper.scrapeAll(5);
    await scraper.saveToFile();
  })();
}

module.exports = CourseScraper;
