console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const BASE_PATH = new URL('.', import.meta.url).pathname;

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/sadhanapt36', title: 'GitHub' },
];

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;

  if (!url.startsWith('http')) {
    url = BASE_PATH + url;
  }

  let a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  // Treat /index.html and / as the same page.
  let linkPath = a.pathname.replace(/index\.html$/, '');
  let currentPath = location.pathname.replace(/index\.html$/, '');

  if (a.host === location.host && linkPath === currentPath) {
    a.classList.add('current');
  }

  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  nav.append(a);
}

document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
  `,
);

let select = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', (event) => {
  let colorScheme = event.target.value;

  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
});

let form = document.querySelector('form');

form?.addEventListener('submit', (event) => {
  event.preventDefault();

  let data = new FormData(form);
  let params = [];

  for (let [name, value] of data) {
    params.push(
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    );
  }

  let url = `${form.action}?${params.join('&')}`;
  location.href = url;
});


// ---------- Lab 4: data loading and rendering ----------

export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

const VALID_HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  // Guard against a missing container
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects: containerElement is not a valid DOM element.');
    return;
  }

  // Only allow real heading tags; fall back to h2 otherwise
  if (!VALID_HEADINGS.includes(String(headingLevel).toLowerCase())) {
    console.warn(`renderProjects: "${headingLevel}" is not a heading tag, using h2.`);
    headingLevel = 'h2';
  }

  // Clear existing content so projects aren't duplicated
  containerElement.innerHTML = '';

  // Placeholder when there is nothing to show
  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p class="projects-empty">No projects to display yet.</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    const title = project.title ?? 'Untitled project';
    const image = project.image || 'https://vis-society.github.io/labs/2/images/empty.svg';
    const description = project.description ?? '';
    const year = project.year ? `<p class="project-year">${project.year}</p>` : '';

    article.innerHTML = `
      <${headingLevel}>${title}</${headingLevel}>
      <img src="${image}" alt="${title}">
      <div>
        <p>${description}</p>
        ${year}
      </div>
    `;
    containerElement.appendChild(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
