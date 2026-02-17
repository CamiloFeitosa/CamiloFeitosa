const https = require('https');
const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GITHUB_ACTOR || process.argv[2];
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const CURRENT_YEAR = new Date().getFullYear();

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchGraphQL(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'User-Agent': 'GitHub-Stats-Generator',
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`GraphQL Error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getGitHubStats() {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          totalCommitContributions
          restrictedContributionsCount
        }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
          totalCount
        }
        pullRequests(first: 1) {
          totalCount
        }
        openIssues: issues(states: OPEN) {
          totalCount
        }
        closedIssues: issues(states: CLOSED) {
          totalCount
        }
        followers {
          totalCount
        }
        repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}) {
          totalCount
          nodes {
            stargazers {
              totalCount
            }
          }
        }
      }
    }
  `.replace('$username', `"${USERNAME}"`);

  const result = await fetchGraphQL(query);
  const user = result.data.user;

  const totalStars = user.repositories.nodes.reduce((acc, repo) => 
    acc + repo.stargazers.totalCount, 0
  );

  return {
    totalCommits: user.contributionsCollection.totalCommitContributions + 
                  user.contributionsCollection.restrictedContributionsCount,
    totalPRs: user.pullRequests.totalCount,
    totalIssues: user.openIssues.totalCount + user.closedIssues.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
    totalStars: totalStars
  };
}

async function getCommitsThisYear() {
  const startOfYear = `${CURRENT_YEAR}-01-01T00:00:00Z`;
  const query = `
    query($username: String!, $from: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from) {
          totalCommitContributions
          restrictedContributionsCount
        }
      }
    }
  `.replace('$username', `"${USERNAME}"`).replace('$from', `"${startOfYear}"`);

  const result = await fetchGraphQL(query);
  const contributions = result.data.user.contributionsCollection;
  
  return contributions.totalCommitContributions + contributions.restrictedContributionsCount;
}

function generateSVG(stats, commitsThisYear) {
  const width = 495;
  const height = 195;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #ff6e96; animation: fadeInAnimation 0.8s ease-in-out forwards; }
    .stat { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #f8f8f2; }
    .stagger { opacity: 0; animation: fadeInAnimation 0.3s ease-in-out forwards; }
    .rank-text { font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #f8f8f2; animation: scaleInAnimation 0.3s ease-in-out forwards; }
    .bold { font-weight: 700; }
    @keyframes scaleInAnimation {
      from { transform: translate(-5px, 5px) scale(0); }
      to { transform: translate(-5px, 5px) scale(1); }
    }
    @keyframes fadeInAnimation {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  </style>
  
  <rect data-testid="card-bg" x="0.5" y="0.5" rx="4.5" height="99%" stroke="#e4e2e2" width="${width - 1}" fill="#282a36" stroke-opacity="1"/>
  
  <g data-testid="card-title" transform="translate(25, 35)">
    <text x="0" y="0" class="header" data-testid="header">${USERNAME}'s GitHub Stats</text>
  </g>
  
  <g data-testid="main-card-body" transform="translate(0, 55)">
    <svg x="0" y="0">
      <g transform="translate(25, 0)">
        <g class="stagger" style="animation-delay: 450ms" transform="translate(25, 0)">
          <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
            <path fill="#f8f8f2" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <text class="stat bold" x="25" y="12.5">Total Commits:</text>
          <text class="stat" x="190" y="12.5" data-testid="commits">${stats.totalCommits.toLocaleString()}</text>
        </g>
      </g>
      
      <g transform="translate(25, 25)">
        <g class="stagger" style="animation-delay: 600ms" transform="translate(25, 0)">
          <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
            <path fill="#f8f8f2" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
          </svg>
          <text class="stat bold" x="25" y="12.5">Total PRs:</text>
          <text class="stat" x="190" y="12.5" data-testid="prs">${stats.totalPRs.toLocaleString()}</text>
        </g>
      </g>
      
      <g transform="translate(25, 50)">
        <g class="stagger" style="animation-delay: 750ms" transform="translate(25, 0)">
          <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
            <path fill="#f8f8f2" d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            <path fill="#f8f8f2" fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"/>
          </svg>
          <text class="stat bold" x="25" y="12.5">Total Issues:</text>
          <text class="stat" x="190" y="12.5" data-testid="issues">${stats.totalIssues.toLocaleString()}</text>
        </g>
      </g>
      
      <g transform="translate(25, 75)">
        <g class="stagger" style="animation-delay: 900ms" transform="translate(25, 0)">
          <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
            <path fill="#f8f8f2" fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
          </svg>
          <text class="stat bold" x="25" y="12.5">Contributed to:</text>
          <text class="stat" x="190" y="12.5" data-testid="contribs">${stats.contributedTo.toLocaleString()}</text>
        </g>
      </g>
      
      <g transform="translate(25, 100)">
        <g class="stagger" style="animation-delay: 1050ms" transform="translate(25, 0)">
          <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
            <path fill="#f8f8f2" fill-rule="evenodd" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z"/>
          </svg>
          <text class="stat bold" x="25" y="12.5">Commits (${CURRENT_YEAR}):</text>
          <text class="stat" x="190" y="12.5" data-testid="commits-year">${commitsThisYear.toLocaleString()}</text>
        </g>
      </g>
    </svg>
  </g>
  
  <g data-testid="rank-circle" transform="translate(400, 47)">
    <circle class="rank-circle-rim" cx="40" cy="50" r="40" opacity="0.2" stroke="#f8f8f2" stroke-width="6.5" fill="none"/>
    <text x="40" y="55" alignment-baseline="central" dominant-baseline="central" text-anchor="middle" class="rank-text">B-</text>
  </g>
</svg>`.trim();
}

async function main() {
  try {
    console.log('Fetching GitHub stats...');
    const stats = await getGitHubStats();
    
    console.log('Fetching commits for current year...');
    const commitsThisYear = await getCommitsThisYear();
    
    console.log('Generating SVG...');
    const svg = generateSVG(stats, commitsThisYear);
    
    const profileDir = path.join(__dirname, '..', 'profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    
    const svgPath = path.join(profileDir, 'stats.svg');
    fs.writeFileSync(svgPath, svg);
    
    console.log('✅ Stats card generated successfully!');
    console.log(`Total Commits: ${stats.totalCommits}`);
    console.log(`Commits (${CURRENT_YEAR}): ${commitsThisYear}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
