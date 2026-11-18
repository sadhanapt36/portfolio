import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ---------- Shared state ----------
// Scales live at module level so the brush and update functions can reach them
let xScale;
let yScale;
let rScale;
let brushSelection = null;
let currentCommit = null; // the newest commit on screen; highlighted in both charts

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 30 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

// One color per technology (css, html, js…), shared by the language breakdown and file dots
const colors = d3.scaleOrdinal(d3.schemeTableau10);

// ---------- Data ----------
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;
      const ret = {
        id: commit,
        url: 'https://github.com/sadhanapt36/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Hidden property: available as commit.lines but not shown in console.log
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: false,
        writable: false,
        enumerable: false,
      });

      return ret;
    })
    // Chronological order, so the scrolly story reads oldest → newest (Step 3.3)
    .sort((a, b) => a.datetime - b.datetime);
}

// ---------- Summary stats ----------
function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();
  const dl = container.append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Commits');
  dl.append('dd').text(commits.length);

  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  dl.append('dt').text('Avg file length');
  dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1]) ?? 0));

  dl.append('dt').text('Longest line');
  dl.append('dd').text(d3.max(data, (d) => d.length) ?? 0);

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  dl.append('dt').text('Most active time');
  dl.append('dd').text(d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '—');
}

// ---------- Tooltip ----------
function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id;

  document.getElementById('commit-date').textContent =
    commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-clock').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

// ---------- Scatterplot ----------
// Builds the SVG, axes and gridlines ONCE. Later changes go through updateScatterPlot().
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([-1.5, 25.5]) // padding so dots at midnight aren't cut off by the axes
    .range([usableArea.bottom, usableArea.top]);
  const hourTicks = d3.range(0, 25, 2);

  // Radius scale uses ALL commits, so a dot keeps its size as the slider moves
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([4, 30]);

  // Gridlines, tinted blue at night and orange at midday
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(
    d3.axisLeft(yScale).tickValues(hourTicks).tickFormat('').tickSize(-usableArea.width),
  );
  gridlines.selectAll('.tick line').attr('stroke', (d) => {
    const daylight = Math.cos(((d - 12) / 12) * Math.PI);
    return d3.interpolateRgb('#4a6fa5', '#e8a33d')((daylight + 1) / 2);
  });

  svg.append('g').attr('class', 'dots');

  // Axes get classes so updateScatterPlot can find and redraw them (Step 1.2)
  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(hourTicks)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'),
    );

  createBrushSelector(svg);
  updateScatterPlot(data, commits);
}

// Updates the existing SVG instead of drawing a new one each time
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart svg');

  // Re-fit the x domain to the visible commits (keep a little room when there is only one)
  const [minDate, maxDate] = d3.extent(commits, (d) => d.datetime);
  if (minDate && +minDate === +maxDate) {
    xScale.domain([d3.timeDay.offset(minDate, -1), d3.timeDay.offset(maxDate, 1)]);
  } else if (minDate) {
    xScale.domain([minDate, maxDate]).nice();
  }

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale));

  // Big dots first so smaller ones sit on top and stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    // Key by commit id so each commit keeps its own circle (Step 1.3)
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    // Bigger circles animate in more slowly (Step 1.4, optional)
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .classed('current', (d) => d.id === currentCommit?.id)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Re-apply any brush selection to the dots now on screen
  applyBrushSelection();
}

// ---------- Brushing ----------
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  // The brush overlay catches all mouse events; move dots and axes above it
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function brushed(event) {
  brushSelection = event.selection;
  applyBrushSelection();
}

function applyBrushSelection() {
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(brushSelection, d),
  );
  const selectedCommits = brushSelection
    ? filteredCommits.filter((d) => isCommitSelected(brushSelection, d))
    : [];
  renderSelectionCount(selectedCommits);
  renderLanguageBreakdown(selectedCommits);
}

function renderSelectionCount(selectedCommits) {
  const n = selectedCommits.length;
  document.querySelector('#selection-count').textContent =
    `${n || 'No'} commit${n === 1 ? '' : 's'} selected`;
}

function renderLanguageBreakdown(selectedCommits) {
  const container = document.getElementById('language-breakdown');
  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const formatted = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `
      <dt style="--color: ${colors(language)}">${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// ---------- Unit visualization: one dot per line, grouped by file (Step 2) ----------
function updateFileDisplay(commits) {
  const lines = commits.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    // Biggest files first (Step 2.3)
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // Build the structure once per file; updates only refresh the contents
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').call((dt) => {
            dt.append('code');
            dt.append('small');
          });
          div.append('dd');
        }),
    )
    .order();

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    // Lines written in the newest commit on screen get highlighted
    .classed('new', (d) => d.commit === currentCommit?.id)
    // Color each dot by technology (Step 2.4)
    .attr('style', (d) => `--color: ${colors(d.type)}`);

  d3.select('#files').classed('has-highlight', !!currentCommit);
  const note = document.getElementById('files-highlight');
  if (currentCommit) {
    const n = lines.filter((d) => d.commit === currentCommit.id).length;
    const when = currentCommit.datetime.toLocaleString('en', { dateStyle: 'medium' });
    note.textContent = `Glowing dots: the ${n} line${n === 1 ? '' : 's'} from the latest commit shown (${when}).`;
  } else {
    note.textContent = '';
  }
}

// ---------- Scrollytelling text (Step 3.2) ----------
function renderStory(commits) {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => {
      const fileCount = d3.rollups(d.lines, (v) => v.length, (l) => l.file).length;
      const when = d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const label =
        i === 0
          ? 'my first commit, and it was glorious'
          : 'another commit';
      return `
        <p>On ${when}, I made <a href="${d.url}" target="_blank">${label}</a>.</p>
        <p>I edited <strong>${d.totalLines}</strong> line${d.totalLines === 1 ? '' : 's'}
           across <strong>${fileCount}</strong> file${fileCount === 1 ? '' : 's'}.</p>
      `;
    });
}

// ---------- Main ----------
const data = await loadData();
const commits = processCommits(data);

// Slider (0–100) ↔ date (Step 1.1)
const timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);

let commitProgress = 100;
let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;

const slider = document.getElementById('commit-progress');
const timeLabel = document.getElementById('commit-time');

// One function updates everything for a new cut-off date
function setMaxTime(newMaxTime) {
  commitMaxTime = newMaxTime;
  timeLabel.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  timeLabel.dateTime = commitMaxTime.toISOString();

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  currentCommit = filteredCommits.at(-1) ?? null;

  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  setMaxTime(timeScale.invert(commitProgress));
}

slider.addEventListener('input', () => {
  stopPlaying();
  onTimeSliderChange();
});

// ---------- Play button: replay the site's history one commit at a time ----------
const playBtn = document.getElementById('play-btn');
let playTimer = null;

function showCommit(commit) {
  slider.value = timeScale(commit.datetime);
  commitProgress = Number(slider.value);
  setMaxTime(commit.datetime);
}

function stopPlaying() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  playBtn.textContent = '▶ Play';
  playBtn.setAttribute('aria-label', 'Play history');
}

function startPlaying() {
  // Start over if we're already at the end
  let i = filteredCommits.length >= commits.length ? 0 : filteredCommits.length;
  showCommit(commits[i]);
  playBtn.textContent = '❚❚ Pause';
  playBtn.setAttribute('aria-label', 'Pause history');

  playTimer = setInterval(() => {
    i += 1;
    if (i >= commits.length) {
      stopPlaying();
      return;
    }
    showCommit(commits[i]);
  }, 900);
}

playBtn.addEventListener('click', () => (playTimer ? stopPlaying() : startPlaying()));

renderCommitInfo(data, commits); // summary always covers the whole repo
renderScatterPlot(data, commits);
onTimeSliderChange();
renderStory(commits);

// Scrollama: scrolling to a step shows the site up to that commit (Step 3.3)
function onStepEnter(response) {
  stopPlaying();
  showCommit(response.element.__data__);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
    offset: 0.5,
  })
  .onStepEnter(onStepEnter);

window.addEventListener('resize', () => scroller.resize());
