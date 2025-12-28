let network = null;
let allNodes = [];
let allEdges = [];
let coursesData = [];
let currentDepartment = null;

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
    const deptCodes = new Set();
    const courseNumbers = new Map();

    allNodes.forEach(node => {
        const parts = node.id.split(' ');
        if (parts.length === 2) {
            const [dept, num] = parts;
            deptCodes.add(dept);

            if (!courseNumbers.has(dept)) {
                courseNumbers.set(dept, new Set());
            }
            courseNumbers.get(dept).add(num);
        }
    });

    const deptSelect = document.getElementById('deptCodeSelect');
    const sortedDepts = Array.from(deptCodes).sort();
    sortedDepts.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        deptSelect.appendChild(option);
    });

    deptSelect.addEventListener('change', () => {
        const numSelect = document.getElementById('courseNumSelect');
        numSelect.innerHTML = '<option value="">Course Number</option>';

        const selectedDept = deptSelect.value;
        if (selectedDept && courseNumbers.has(selectedDept)) {
            const numbers = Array.from(courseNumbers.get(selectedDept)).sort();
            numbers.forEach(num => {
                const option = document.createElement('option');
                option.value = num;
                option.textContent = num;
                numSelect.appendChild(option);
            });
        }
    });
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
        network.fit();
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
        const dept = document.getElementById('deptCodeSelect').value;
        const num = document.getElementById('courseNumSelect').value;

        if (dept && num) {
            const courseCode = `${dept} ${num}`;
            focusOnCourse(courseCode);
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        resetHighlight();
        network.fit();
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

        // Highlight the course and its prerequisites/corequisites
        highlightCourseWithDependencies(courseCode, courseData);
        displayCourseInfo(courseData);

        // Center on the selected course
        setTimeout(() => {
            network.focus(courseCode, {
                scale: 1.5,
                animation: true
            });
        }, 100);

    } catch (error) {
        console.error('Error fetching course data:', error);
    }
}

function highlightCourseWithDependencies(courseCode, courseData) {
    const prerequisites = new Set(courseData.prerequisites || []);
    const corequisites = new Set(courseData.corequisites || []);

    const updatedNodes = allNodes.map(node => {
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

    nodes.clear();
    nodes.add(updatedNodes);
}

function resetHighlight() {
    nodes.clear();
    nodes.add(allNodes);

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

    infoDiv.innerHTML = `
        <h4 class="course-code">${course.code}</h4>
        <h5>${course.name}</h5>
        <p><strong>Department:</strong> ${course.department}</p>

        <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;">
            <strong>Legend:</strong><br>
            <span style="color: #e84a27;">●</span> Selected Course<br>
            <span style="color: #2196F3;">●</span> Prerequisites (Blue)<br>
            <span style="color: #4CAF50;">●</span> Corequisites (Green)<br>
            <span style="color: #cccccc;">●</span> Other Department Courses
        </div>

        <h4>Description</h4>
        <p>${description}</p>

        <h4>Prerequisites</h4>
        ${prereqHtml}

        <h4>Corequisites</h4>
        ${coreqHtml}
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

window.addEventListener('DOMContentLoaded', init);
