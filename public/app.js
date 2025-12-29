let network = null;
let allNodes = [];
let allEdges = [];
let coursesData = [];
let currentDepartment = null;
let currentSelectedCourse = null;
let currentCourseData = null;
let showOtherCourses = true;

const API_BASE = CONFIG.API_BASE;

const nodes = new vis.DataSet();
const edges = new vis.DataSet();

async function init() {
    await loadDepartments();
    await loadGraphData();
    initNetwork();
    populateSearchDropdowns();
    setupEventListeners();
    updateStats();
}

async function loadDepartments() {
    try {
        const response = await fetch(`${API_BASE}/departments`);
        const departments = await response.json();

        const deptFilterSelect = document.getElementById('deptFilterSelect');
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            deptFilterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

async function loadGraphData(department = null) {
    try {
        const url = department
            ? `${API_BASE}/graph?dept=${encodeURIComponent(department)}`
            : `${API_BASE}/graph?limit=500`;
        const response = await fetch(url);
        const data = await response.json();

        currentDepartment = department;

        allNodes = data.nodes.map(node => ({
            id: node.id,
            label: node.id,
            title: `${node.id}: ${node.name}`,
            color: {
                background: '#13294b',
                border: '#0d1d33',
                highlight: {
                    background: '#e84a27',
                    border: '#c23d1f'
                }
            },
            font: { color: '#ffffff', size: 12 },
            data: node
        }));

        allEdges = data.edges.map((edge, index) => ({
            id: index,
            from: edge.from,
            to: edge.to,
            arrows: 'to',
            color: {
                color: edge.type === 'prerequisite' ? '#666666' : '#4CAF50',
                highlight: '#e84a27'
            },
            width: edge.type === 'prerequisite' ? 1 : 2,
            dashes: edge.type === 'corequisite',
            title: edge.type
        }));

        nodes.clear();
        edges.clear();
        nodes.add(allNodes);
        edges.add(allEdges);

        const coursesResponse = await fetch(`${API_BASE}/graph`);
        const coursesGraphData = await coursesResponse.json();
        coursesData = coursesGraphData.nodes;

    } catch (error) {
        console.error('Error loading graph data:', error);
    }
}

function initNetwork() {
    const container = document.getElementById('network');
    const data = { nodes, edges };

    const options = {
        layout: {
            improvedLayout: true,
            hierarchical: {
                enabled: false
            }
        },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -8000,
                springConstant: 0.04,
                springLength: 95
            },
            stabilization: {
                iterations: 200
            }
        },
        interaction: {
            hover: true,
            navigationButtons: true,
            keyboard: true
        },
        nodes: {
            shape: 'dot',
            size: 15
        }
    };

    network = new vis.Network(container, data, options);

    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            focusOnCourse(nodeId);
        } else {
            resetHighlight();
        }
    });
}

function populateSearchDropdowns() {
    const courseNumbers = new Set();

    // Extract course numbers from currently loaded nodes
    allNodes.forEach(node => {
        const parts = node.id.split(' ');
        if (parts.length === 2) {
            const [dept, num] = parts;
            // Only add if it matches the current department filter
            if (currentDepartment && dept === currentDepartment) {
                courseNumbers.add(num);
            }
        }
    });

    const numSelect = document.getElementById('courseNumSelect');

    if (currentDepartment && courseNumbers.size > 0) {
        // Populate with course numbers from the selected department
        numSelect.innerHTML = '<option value="">Select Course Number</option>';
        const sortedNumbers = Array.from(courseNumbers).sort((a, b) => {
            // Sort numerically
            return parseInt(a) - parseInt(b);
        });
        sortedNumbers.forEach(num => {
            const option = document.createElement('option');
            option.value = num;
            option.textContent = num;
            numSelect.appendChild(option);
        });
    } else {
        // No department selected
        numSelect.innerHTML = '<option value="">Select a department first</option>';
    }
}

function setupEventListeners() {
    document.getElementById('filterBtn').addEventListener('click', async () => {
        const dept = document.getElementById('deptFilterSelect').value;
        await loadGraphData(dept || null);
        nodes.clear();
        edges.clear();
        nodes.add(allNodes);
        edges.add(allEdges);
        populateSearchDropdowns();
        network.fit({
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            },
            maxZoomLevel: 0.5  // Limit zoom to prevent too close view
        });
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
        const num = document.getElementById('courseNumSelect').value;

        if (currentDepartment && num) {
            const courseCode = `${currentDepartment} ${num}`;
            focusOnCourse(courseCode);
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        resetHighlight();
        network.fit({
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            },
            maxZoomLevel: 0.5
        });
    });

    document.getElementById('toggleOtherCoursesBtn').addEventListener('click', () => {
        showOtherCourses = !showOtherCourses;
        const btn = document.getElementById('toggleOtherCoursesBtn');
        btn.textContent = showOtherCourses ? 'Hide Other Courses' : 'Show Other Courses';

        if (currentSelectedCourse && currentCourseData) {
            highlightCourseWithDependencies(currentSelectedCourse, currentCourseData);
        }
    });

    document.getElementById('suggestCoursesBtn').addEventListener('click', async () => {
        const input = document.getElementById('completedCoursesInput').value.trim();
        if (!input) {
            alert('Please enter at least one completed course');
            return;
        }

        // Parse input - split by comma and clean up
        const completedCourses = input.split(',')
            .map(c => c.trim().toUpperCase())
            .filter(c => c.length > 0);

        await showCourseSuggestions(completedCourses);
    });
}

async function focusOnCourse(courseCode) {
    try {
        // Get course data
        const response = await fetch(`${API_BASE}/course/${courseCode.replace(' ', '-')}`);
        const courseData = await response.json();

        // Extract department from course code (e.g., "CS 225" -> "CS")
        const dept = courseCode.split(' ')[0];

        // Load only the department's courses
        await loadGraphData(dept);

        // Clear and reload the graph with department data
        nodes.clear();
        edges.clear();
        nodes.add(allNodes);
        edges.add(allEdges);
        populateSearchDropdowns();

        // Store current selection
        currentSelectedCourse = courseCode;
        currentCourseData = courseData;
        showOtherCourses = true;

        // Show toggle button
        document.getElementById('toggleOtherCoursesBtn').style.display = 'inline-block';
        document.getElementById('toggleOtherCoursesBtn').textContent = 'Hide Other Courses';

        // Highlight the course and its prerequisites/corequisites
        highlightCourseWithDependencies(courseCode, courseData);
        displayCourseInfo(courseData);

        // Wait for network to stabilize before focusing
        // This ensures the node positions are calculated
        network.once('stabilized', () => {
            network.focus(courseCode, {
                scale: 1.2,
                animation: {
                    duration: 1000,
                    easingFunction: 'easeInOutQuad'
                }
            });
        });

        // Trigger stabilization if it's not already running
        network.stabilize();

    } catch (error) {
        console.error('Error fetching course data:', error);
    }
}

function highlightCourseWithDependencies(courseCode, courseData) {
    const prerequisites = new Set(courseData.prerequisites || []);
    const corequisites = new Set(courseData.corequisites || []);
    const postrequisites = new Set((courseData.postrequisites || []).map(p => p.code));

    // Create set of all relevant courses (selected + pre/co/post requisites)
    const relevantCourses = new Set([
        courseCode,
        ...prerequisites,
        ...corequisites,
        ...postrequisites
    ]);

    const updatedNodes = allNodes
        .filter(node => {
            // If hiding other courses, only show relevant ones
            if (!showOtherCourses) {
                return relevantCourses.has(node.id);
            }
            return true;
        })
        .map(node => {
            if (node.id === courseCode) {
                // Selected course - orange/red (UIUC orange)
                return {
                    ...node,
                    color: {
                        background: '#e84a27',
                        border: '#c23d1f'
                    },
                    font: { color: '#ffffff', size: 16, bold: true },
                    size: 30
                };
            } else if (prerequisites.has(node.id)) {
                // Prerequisites - blue
                return {
                    ...node,
                    color: {
                        background: '#2196F3',
                        border: '#1976D2'
                    },
                    font: { color: '#ffffff', size: 14 },
                    size: 20
                };
            } else if (corequisites.has(node.id)) {
                // Corequisites - green
                return {
                    ...node,
                    color: {
                        background: '#4CAF50',
                        border: '#388E3C'
                    },
                    font: { color: '#ffffff', size: 14 },
                    size: 20
                };
            } else if (postrequisites.has(node.id)) {
                // Postrequisites - purple
                return {
                    ...node,
                    color: {
                        background: '#9C27B0',
                        border: '#7B1FA2'
                    },
                    font: { color: '#ffffff', size: 14 },
                    size: 20
                };
            } else {
                // Other courses in department - dimmed
                return {
                    ...node,
                    color: {
                        background: '#cccccc',
                        border: '#999999'
                    },
                    font: { color: '#666666', size: 10 },
                    opacity: 0.5
                };
            }
        });

    // Filter edges to only show connections between visible nodes
    const visibleNodeIds = new Set(updatedNodes.map(n => n.id));
    const relevantEdges = allEdges.filter(edge =>
        visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    );

    nodes.clear();
    edges.clear();
    nodes.add(updatedNodes);
    edges.add(relevantEdges);
}

function resetHighlight() {
    nodes.clear();
    edges.clear();
    nodes.add(allNodes);
    edges.add(allEdges);

    // Reset state
    currentSelectedCourse = null;
    currentCourseData = null;
    showOtherCourses = true;

    // Hide toggle button
    document.getElementById('toggleOtherCoursesBtn').style.display = 'none';

    document.getElementById('courseInfo').innerHTML =
        '<p>Click on a course node or search for a course to see details</p>';
}

function displayCourseInfo(course) {
    const infoDiv = document.getElementById('courseInfo');

    let prereqHtml = '<p>None</p>';
    if (course.prerequisites && course.prerequisites.length > 0) {
        prereqHtml = '<ul>' + course.prerequisites.map(prereq =>
            `<li><span class="course-link" onclick="focusOnCourse('${prereq}')">${prereq}</span></li>`
        ).join('') + '</ul>';
    }

    let coreqHtml = '<p>None</p>';
    if (course.corequisites && course.corequisites.length > 0) {
        coreqHtml = '<ul>' + course.corequisites.map(coreq =>
            `<li><span class="course-link" onclick="focusOnCourse('${coreq}')">${coreq}</span></li>`
        ).join('') + '</ul>';
    }

    let description = course.description || 'No description available';

    const coursePattern = /([A-Z]{2,4})\s*(\d{3})/g;
    description = description.replace(coursePattern, (match) => {
        const normalized = match.replace(/\s+/g, ' ');
        return `<span class="course-link" onclick="focusOnCourse('${normalized}')">${normalized}</span>`;
    });

    // Format postrequisites
    let postreqHtml = '<p>None</p>';
    if (course.postrequisites && course.postrequisites.length > 0) {
        postreqHtml = '<ul>' + course.postrequisites.map(postreq => {
            let otherPrereqsText = '';
            if (postreq.otherPrerequisites && postreq.otherPrerequisites.length > 0) {
                const requireText = postreq.hasOrInPrereqs ? 'also may require' : 'also requires';
                const checkDescText = postreq.hasOrInPrereqs ? ' - check course description for details' : '';
                otherPrereqsText = ` <span style="font-size: 0.9em; color: #666;">(${requireText}: ${postreq.otherPrerequisites.join(', ')}${checkDescText})</span>`;
            }
            return `<li><span class="course-link" onclick="focusOnCourse('${postreq.code}')">${postreq.code}</span> - ${postreq.name}${otherPrereqsText}</li>`;
        }).join('') + '</ul>';
    }

    infoDiv.innerHTML = `
        <h4 class="course-code">${course.code}</h4>
        <h5>${course.name}</h5>
        <p><strong>Department:</strong> ${course.department}</p>

        <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;">
            <strong>Legend:</strong><br>
            <span style="color: #e84a27;">●</span> Selected Course<br>
            <span style="color: #2196F3;">●</span> Prerequisites (Blue)<br>
            <span style="color: #4CAF50;">●</span> Corequisites (Green)<br>
            <span style="color: #9C27B0;">●</span> Postrequisites (Purple)<br>
            <span style="color: #cccccc;">●</span> Other Department Courses
        </div>

        <h4>Description</h4>
        <p>${description}</p>

        <h4>Prerequisites</h4>
        ${prereqHtml}

        <h4>Corequisites</h4>
        ${coreqHtml}

        <h4>Postrequisites (Courses You Can Take After)</h4>
        ${postreqHtml}
    `;
}

async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();

        document.getElementById('stats').innerHTML = `
            ${stats.totalCourses} courses |
            ${stats.prerequisiteEdges} prerequisite connections |
            ${stats.corequisiteEdges} corequisite connections |
            ${stats.departments} departments
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function showCourseSuggestions(completedCourses) {
    try {
        const response = await fetch(`${API_BASE}/suggest-courses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completedCourses })
        });

        const suggestions = await response.json();
        displayCourseSuggestions(completedCourses, suggestions);
    } catch (error) {
        console.error('Error getting course suggestions:', error);
        alert('Error getting course suggestions. Please try again.');
    }
}

function displayCourseSuggestions(completedCourses, suggestions) {
    const infoDiv = document.getElementById('courseInfo');

    const completedList = completedCourses.join(', ');

    let canTakeHtml = '<p>None</p>';
    if (suggestions.canTake.length > 0) {
        canTakeHtml = `<ul>${suggestions.canTake.map(course =>
            `<li>
                <span class="course-link" onclick="focusOnCourse('${course.code}')">${course.code}</span> - ${course.name}
                <span style="font-size: 0.85em; color: #666;"> (${course.department})</span>
            </li>`
        ).join('')}</ul>`;
    }

    let partialHtml = '<p>None</p>';
    if (suggestions.partialPrereqs.length > 0) {
        partialHtml = `<ul>${suggestions.partialPrereqs.slice(0, 50).map(course => {
            const missing = [...course.missingPrereqs, ...course.missingCoreqs];
            return `<li>
                <span class="course-link" onclick="focusOnCourse('${course.code}')">${course.code}</span> - ${course.name}
                <span style="font-size: 0.85em; color: #666;"> (${course.department})</span>
                <br><span style="font-size: 0.8em; color: #999;">Still need: ${missing.join(', ')}</span>
            </li>`;
        }).join('')}</ul>`;
        if (suggestions.partialPrereqs.length > 50) {
            partialHtml += `<p style="font-size: 0.9em; color: #666;"><em>Showing first 50 of ${suggestions.partialPrereqs.length} courses</em></p>`;
        }
    }

    let noPrereqsHtml = '<p>None</p>';
    if (suggestions.noPrereqs.length > 0) {
        noPrereqsHtml = `<ul>${suggestions.noPrereqs.slice(0, 50).map(course =>
            `<li>
                <span class="course-link" onclick="focusOnCourse('${course.code}')">${course.code}</span> - ${course.name}
                <span style="font-size: 0.85em; color: #666;"> (${course.department})</span>
            </li>`
        ).join('')}</ul>`;
        if (suggestions.noPrereqs.length > 50) {
            noPrereqsHtml += `<p style="font-size: 0.9em; color: #666;"><em>Showing first 50 of ${suggestions.noPrereqs.length} courses</em></p>`;
        }
    }

    infoDiv.innerHTML = `
        <h3>Course Suggestions</h3>
        <p><strong>Completed Courses:</strong> ${completedList}</p>
        <p style="font-size: 0.9em; color: #666; margin-top: 10px;">
            <em>Note: Suggestions don't account for "or" requirements. Check individual course descriptions for flexible prerequisites.</em>
        </p>

        <h4 style="color: #4CAF50; margin-top: 20px;">✓ Ready to Take (${suggestions.canTake.length})</h4>
        <p style="font-size: 0.9em; margin-bottom: 10px;">All prerequisites and corequisites completed</p>
        ${canTakeHtml}

        <h4 style="color: #FF9800; margin-top: 20px;">◐ Partially Ready (${suggestions.partialPrereqs.length})</h4>
        <p style="font-size: 0.9em; margin-bottom: 10px;">Some prerequisites completed</p>
        ${partialHtml}

        <h4 style="color: #2196F3; margin-top: 20px;">○ No Prerequisites Required (${suggestions.noPrereqs.length})</h4>
        <p style="font-size: 0.9em; margin-bottom: 10px;">Open to all students</p>
        ${noPrereqsHtml}
    `;

    // Hide toggle button when showing suggestions
    document.getElementById('toggleOtherCoursesBtn').style.display = 'none';
}

window.addEventListener('DOMContentLoaded', init);
