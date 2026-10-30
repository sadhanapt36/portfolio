import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = (await fetchJSON('../lib/projects.json')) ?? [];
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

// Filter state: both filters are kept here and always applied together
let query = '';
let selectedYear = null; // null means no wedge selected (the lab's selectedIndex = -1)

// Give each year a fixed color, so colors don't shift when the pie is filtered
const allYears = [...new Set(projects.map((p) => p.year))].sort();
const colors = d3.scaleOrdinal(d3.schemeTableau10).domain(allYears);

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

function filterByQuery(projectsGiven) {
  return projectsGiven.filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

function renderPieChart(projectsGiven) {
  // Count projects per year, sorted by year
  const rolledData = d3
    .rollups(projectsGiven, (v) => v.length, (d) => d.year)
    .sort((a, b) => d3.ascending(a[0], b[0]));
  const data = rolledData.map(([year, count]) => ({ value: count, label: year }));

  const sliceGenerator = d3.pie().value((d) => d.value).sort(null);
  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  // Clear the old pie and legend before drawing new ones
  const svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  const isSelected = (idx) => data[idx].label === selectedYear;
  const toggle = (idx) => {
    selectedYear = isSelected(idx) ? null : data[idx].label;
    renderAll();
  };

  arcs.forEach((arc, idx) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[idx].label))
      .attr('class', isSelected(idx) ? 'selected' : null)
      .on('click', () => toggle(idx))
      .append('title')
      .text(`${data[idx].label}: ${data[idx].value} project${data[idx].value === 1 ? '' : 's'}`);
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', isSelected(idx) ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => toggle(idx));
  });

  if (data.length === 0) {
    legend.append('li').attr('class', 'legend-item legend-empty').text('No matching projects');
  }
}

// Applies BOTH filters every time, so search + pie selection combine (Step 5.4 fix)
function renderAll() {
  const searched = filterByQuery(projects);

  // If the selected year no longer has any matching projects, clear the selection
  if (selectedYear !== null && !searched.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  const visible =
    selectedYear === null ? searched : searched.filter((p) => p.year === selectedYear);

  renderProjects(visible, projectsContainer, 'h2');
  renderPieChart(searched);

  if (projectsTitle) {
    projectsTitle.textContent = `${visible.length} Project${visible.length === 1 ? '' : 's'}`;
  }
}

searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  renderAll();
});

// First render on page load
renderAll();
