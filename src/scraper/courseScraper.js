// Web scraper for University of Illinois course catalog
// Scrapes course information including prerequisites and corequisites from hyperlinks
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class CourseScraper {
  constructor(baseUrl = 'https://catalog.illinois.edu/courses-of-instruction/') {
    this.baseUrl = baseUrl; // Main catalog page URL
    this.courses = []; // Array to store all scraped courses
  }

  /**
   * Fetches HTML content from a given URL
   * @param {string} url - The URL to fetch
   * @returns {string|null} HTML content or null if error
   */
  async fetchPage(url) {
    try {
      // Add user agent header to avoid being blocked by the server
      // Add timeout to prevent hanging on slow requests
      const response = await axios.get(url, {
        timeout: 15000, // 15 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Parses prerequisites and corequisites from course description HTML
   * Prerequisites are courses that must be completed before taking this course
   * Corequisites are courses that must be taken concurrently
   * @param {object} $descBlock - Cheerio object containing course description
   * @param {string} currentCourseCode - The code of the current course being parsed
   * @returns {object} Object with prerequisites and corequisites arrays
   */
  parsePrerequisitesAndCorequisites($descBlock, currentCourseCode) {
    const prerequisites = [];
    const corequisites = [];

    // Get the text content to search for "Prerequisite:" section
    const descText = $descBlock.text();

    // Look for the word "Prerequisite:" in the description
    const prereqIndex = descText.indexOf('Prerequisite:');
    if (prereqIndex === -1) {
      // No prerequisites found, return empty arrays
      return { prerequisites, corequisites };
    }

    // Extract only the prerequisite section (everything after "Prerequisite:")
    const prereqSection = descText.substring(prereqIndex);

    // Find where "concurrent registration" or "Concurrent:" appears
    // This marks the boundary between prerequisites and corequisites
    const concurrentMatches = [
      prereqSection.toLowerCase().indexOf('concurrent registration'),
      prereqSection.toLowerCase().indexOf('concurrent:')
    ].filter(idx => idx !== -1);

    const concurrentBoundary = concurrentMatches.length > 0
      ? Math.min(...concurrentMatches)
      : Infinity; // No concurrent boundary, all are prerequisites

    // Patterns that indicate a course should NOT be counted as a prerequisite
    const exclusionPatterns = [
      /cannot be taken concurrently/i,
      /may not be taken concurrently/i,
      /credit is not given/i,
      /no credit.*toward/i,
      /not open to students/i,
      /same as/i
    ];

    // Find all course code links in the description
    // Links look like <a href="/...">CS 225</a>
    $descBlock.find('a').each((i, elem) => {
      const $link = cheerio.load(elem);
      const linkText = $link.text().trim();

      // Match course codes like "CS 225", "MATH 221", etc.
      const courseMatch = linkText.match(/([A-Z]{2,4})\s*(\d{3})/);

      if (courseMatch) {
        // Format the course name consistently (e.g., "CS 225")
        const courseName = `${courseMatch[1]} ${courseMatch[2]}`;

        // Skip if this course references itself
        if (courseName === currentCourseCode) {
          return; // Skip self-references
        }

        // Find where this course appears in the prerequisite section
        const linkPosition = prereqSection.indexOf(linkText);
        if (linkPosition !== -1) {
          // Check if the course appears in an exclusion context
          // Look at the surrounding text (50 characters before and after the course code)
          const contextStart = Math.max(0, linkPosition - 50);
          const contextEnd = Math.min(prereqSection.length, linkPosition + linkText.length + 50);
          const context = prereqSection.substring(contextStart, contextEnd);

          // Skip this course if it matches any exclusion pattern
          const shouldExclude = exclusionPatterns.some(pattern => pattern.test(context));
          if (shouldExclude) {
            return; // Skip courses in negative contexts
          }

          // If the course appears AFTER "concurrent registration", it's a corequisite
          // Otherwise, it's a prerequisite
          if (linkPosition >= concurrentBoundary) {
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

  /**
   * Scrapes the list of all departments from the main catalog page
   * @returns {Array} Array of department objects with name, code, and URL
   */
  async scrapeDepartmentList() {
    console.log('Fetching department list...');
    const html = await this.fetchPage(this.baseUrl);
    if (!html) return []; // Return empty array if fetch failed

    const $ = cheerio.load(html); // Parse HTML
    const departments = [];

    // Find all links in the A-Z index (each department has a link)
    $('#atozindex a').each((i, elem) => {
      const href = $(elem).attr('href'); // Get the link URL
      const name = $(elem).text().trim(); // Get the department name

      // Skip invalid entries:
      // - No href or undefined href
      // - Single letters (A, B, C headers in the A-Z index)
      // - Very short names
      if (!href || href === 'undefined' || !name || name.length <= 2) {
        return; // Skip to next iteration
      }

      // Extract the department code from the URL
      // Example: "/courses-of-instruction/cs/" -> "cs"
      const pathParts = href.split('/').filter(x => x);
      const courseCode = pathParts[pathParts.length - 1];

      // Only add departments with valid course codes
      if (courseCode && courseCode.length >= 2) {
        departments.push({
          name: name, // e.g., "Computer Science"
          code: courseCode.toUpperCase(), // e.g., "CS"
          url: `https://catalog.illinois.edu${href}` // Full URL to department page
        });
      }
    });

    console.log(`Found ${departments.length} departments`);
    return departments;
  }

  /**
   * Scrapes all courses from a specific department page
   * @param {string} departmentUrl - URL of the department page
   * @param {string} departmentCode - Department code (e.g., "CS")
   * @returns {Array} Array of course objects
   */
  async scrapeDepartmentCourses(departmentUrl, departmentCode) {
    console.log(`Scraping courses from ${departmentCode}...`);
    const html = await this.fetchPage(departmentUrl);
    if (!html) return []; // Return empty array if fetch failed

    const $ = cheerio.load(html); // Parse HTML
    const courses = [];

    // Find all course blocks on the page
    // Each .courseblock div contains one course
    $('.courseblock').each((i, elem) => {
      const $block = $(elem); // Current course block

      // Extract course title (contains course number and name)
      const $title = $block.find('.courseblocktitle');
      const titleText = $title.text().trim();
      // Example formats: "AAS 100   Intro Asian American Studies   credit: 3 Hours."
      // or "225. Data Structures credit: 4 Hours."

      // Extract course number using regex - match "AAS 100" or just "100"
      const courseNumberMatch = titleText.match(/[A-Z]{2,4}\s+(\d{3})|^(\d{3})\./);
      if (!courseNumberMatch) {
        return; // Skip if no course number found
      }

      // Get the course number (either from first or second capture group)
      const courseNumber = courseNumberMatch[1] || courseNumberMatch[2]; // e.g., "225"
      const courseCode = `${departmentCode} ${courseNumber}`; // e.g., "CS 225"

      // Extract course name by removing the course code and credit info
      // "AAS 100   Intro Asian American Studies   credit: 3 Hours." -> "Intro Asian American Studies"
      const courseName = titleText
        .replace(/^[A-Z]{2,4}\s+\d{3}\s+/, '') // Remove "AAS 100 " prefix
        .replace(/\s*credit:.*$/i, '') // Remove "credit: 3 Hours." suffix
        .trim();

      // Extract course description
      const $desc = $block.find('.courseblockdesc');
      const description = $desc.text().trim();

      // Parse prerequisites and corequisites from the description
      const { prerequisites, corequisites } = this.parsePrerequisitesAndCorequisites($desc, courseCode);

      // Add course to array
      courses.push({
        code: courseCode, // e.g., "CS 225"
        name: courseName, // e.g., "Data Structures"
        department: departmentCode, // e.g., "CS"
        description: description, // Full course description
        prerequisites: prerequisites, // Array of prerequisite course codes
        corequisites: corequisites, // Array of corequisite course codes
        url: departmentUrl // Link to department page
      });
    });

    console.log(`  Found ${courses.length} courses`);
    return courses;
  }

  /**
   * Scrapes courses from all (or limited number of) departments
   * @param {number|null} limit - Maximum number of departments to scrape (null = all)
   * @returns {Array} Array of all scraped courses
   */
  async scrapeAll(limit = null) {
    // Get list of all departments
    const departments = await this.scrapeDepartmentList();

    // Wait a bit after fetching the department list before starting to scrape
    console.log('Waiting 3 seconds before starting to scrape departments...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Limit to first N departments if specified (useful for testing)
    const departmentsToScrape = limit ? departments.slice(0, limit) : departments;

    // Scrape each department one by one
    for (const dept of departmentsToScrape) {
      const courses = await this.scrapeDepartmentCourses(dept.url, dept.code);
      this.courses.push(...courses); // Add all courses from this department

      // Wait 2-4 seconds between requests to avoid being rate-limited or blocked
      // Random delay prevents looking like a bot
      // Longer delay needed as the server is strict about rate limiting
      const delay = 2000 + Math.random() * 2000; // Random delay between 2-4 seconds
      console.log(`  Waiting ${Math.round(delay/1000)}s before next department...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.log(`\nTotal courses scraped: ${this.courses.length}`);
    return this.courses;
  }

  /**
   * Saves scraped course data to a JSON file
   * @param {string} filename - Name of the file to save (default: courses.json)
   */
  async saveToFile(filename = 'courses.json') {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '../../data');
    await fs.mkdir(dataDir, { recursive: true });

    // Write courses array to JSON file with pretty formatting
    const filepath = path.join(dataDir, filename);
    await fs.writeFile(filepath, JSON.stringify(this.courses, null, 2));
    console.log(`Data saved to ${filepath}`);
  }

  /**
   * Saves scraped course data to a CSV file
   * @param {string} filename - Name of the file to save (default: courses.csv)
   */
  async saveToCSV(filename = 'courses.csv') {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '../../data');
    await fs.mkdir(dataDir, { recursive: true });

    // CSV header
    const header = 'code,name,department,description,prerequisites,corequisites,url\n';

    // Convert each course to CSV row
    const rows = this.courses.map(course => {
      // Escape fields that might contain commas or quotes
      const escapeCSV = (str) => {
        if (!str) return '';
        str = String(str).replace(/"/g, '""'); // Escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str}"`;
        }
        return str;
      };

      return [
        escapeCSV(course.code),
        escapeCSV(course.name),
        escapeCSV(course.department),
        escapeCSV(course.description),
        escapeCSV(course.prerequisites.join('; ')),
        escapeCSV(course.corequisites.join('; ')),
        escapeCSV(course.url)
      ].join(',');
    }).join('\n');

    const filepath = path.join(dataDir, filename);
    await fs.writeFile(filepath, header + rows);
    console.log(`CSV data saved to ${filepath}`);
  }
}

// If this file is run directly (not imported as a module), run the scraper
if (require.main === module) {
  (async () => {
    const scraper = new CourseScraper();
    // Scrape all departments (pass null or no argument to scrape everything)
    // This will take 10-15 minutes for ~193 departments with 2-4 second delays
    await scraper.scrapeAll();
    await scraper.saveToFile();
    await scraper.saveToCSV();
    console.log('Scraping complete! Data saved in both JSON and CSV formats.');
  })();
}

module.exports = CourseScraper;
