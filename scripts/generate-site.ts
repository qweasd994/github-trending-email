/**
 * Tech Trending Daily - Static Site Generator
 * Run with: pnpm run generate:site
 * 
 * Fetches trending data from all platforms and generates a beautiful static HTML page.
 */

import https from 'https'
import axios from 'axios'
import { load } from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 30000,
})

// ============ Type Definitions ============

interface GithubRepoType {
  title: string
  link: string
  description: string
  language: string
  stars: string
  todayStars: string
}

interface HuggingFaceModel {
  id: string
  author: string
  modelId: string
  downloads: number
  likes: number
  pipeline_tag?: string
  link: string
}

interface HackerNewsStory {
  id: number
  title: string
  url?: string
  score: number
  by: string
  time: number
  descendants: number
  link: string
}

interface DevToArticle {
  id: number
  title: string
  description: string
  url: string
  commentsCount: number
  publicReactionsCount: number
  user: { name: string; username: string }
  tags: string[]
}

interface AIPaper {
  title: string
  authors: string[]
  abstract: string
  url: string
  publishedDate: string
  likes?: number
}

interface IndieRevenue {
  rank: number
  name: string
  description: string
  url: string
  arr: number
  mrr: number
  founders: string[]
  isVerified: boolean
}

interface TrendingData {
  githubTrending: { [key: string]: GithubRepoType[] }
  huggingFaceModels?: HuggingFaceModel[]
  hackerNewsStories?: HackerNewsStory[]
  devToArticles?: DevToArticle[]
  aiPapers?: AIPaper[]
  indieRevenue?: IndieRevenue[]
  fetchedAt: string
}

// ============ Data Fetching ============

async function getTrendingReposByLanguage(language = '', dateRange = 'daily'): Promise<GithubRepoType[]> {
  try {
    const url = language
      ? `https://github.com/trending/${language}?since=${dateRange}`
      : `https://github.com/trending?since=${dateRange}`
    const { data } = await axiosInstance.get(url)
    const $ = load(data)
    const repos: GithubRepoType[] = []
    $('.Box-row').each((_index, element) => {
      const title = $(element).find('h2 a').text().replace(/[\n\s]+/g, '')
      const link = $(element).find('h2 a').attr('href') ?? ''
      const description = $(element).find('p').text().trim()
      const lang = $(element).find('[itemprop=programmingLanguage]').text().trim()
      const stars = $(element).find('.Link--muted').first().text().replace(/[\n\s]+/g, '')
      const todayStars = $(element).find('.float-sm-right').text().trim()
      repos.push({ title, description, language: lang, stars, todayStars, link })
    })
    return repos
  } catch (error) {
    console.error(`Error fetching GitHub trending for ${language || 'all'}:`, (error as Error).message)
    return []
  }
}

async function getHuggingFaceModels(limit = 10): Promise<HuggingFaceModel[]> {
  try {
    const { data } = await axiosInstance.get(
      `https://huggingface.co/api/models?sort=downloads&direction=-1&limit=${limit}`
    )
    return data.map((model: any) => ({
      id: model._id,
      author: model.author || model.id.split('/')[0],
      modelId: model.modelId || model.id,
      downloads: model.downloads || 0,
      likes: model.likes || 0,
      pipeline_tag: model.pipeline_tag,
      link: `https://huggingface.co/${model.id}`,
    }))
  } catch (error) {
    console.error('Error fetching HuggingFace models:', (error as Error).message)
    return []
  }
}

async function getHackerNewsStories(limit = 10): Promise<HackerNewsStory[]> {
  try {
    const { data: storyIds } = await axiosInstance.get(
      'https://hacker-news.firebaseio.com/v0/topstories.json'
    )
    const topIds = storyIds.slice(0, limit)
    const stories = await Promise.all(
      topIds.map(async (id: number) => {
        const { data: story } = await axiosInstance.get(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`
        )
        return {
          id: story.id,
          title: story.title,
          url: story.url,
          score: story.score,
          by: story.by,
          time: story.time,
          descendants: story.descendants || 0,
          link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        }
      })
    )
    return stories
  } catch (error) {
    console.error('Error fetching Hacker News:', (error as Error).message)
    return []
  }
}

async function getDevToArticles(limit = 10): Promise<DevToArticle[]> {
  try {
    const { data } = await axiosInstance.get(
      `https://dev.to/api/articles?per_page=${limit}&top=1`
    )
    return data.map((article: any) => ({
      id: article.id,
      title: article.title,
      description: article.description || '',
      url: article.url,
      commentsCount: article.comments_count || 0,
      publicReactionsCount: article.public_reactions_count || 0,
      user: { name: article.user?.name || '', username: article.user?.username || '' },
      tags: article.tag_list || [],
    }))
  } catch (error) {
    console.error('Error fetching Dev.to:', (error as Error).message)
    return []
  }
}

async function getAIPapers(limit = 10): Promise<AIPaper[]> {
  try {
    const { data } = await axiosInstance.get(
      `https://huggingface.co/api/daily_papers?limit=${limit}`
    )
    return data.map((paper: any) => ({
      title: paper.paper?.title || paper.title || 'Unknown Title',
      authors: paper.paper?.authors?.map((a: any) => a.name || a) || [],
      abstract: paper.paper?.summary || paper.paper?.abstract || '',
      url: paper.paper?.id
        ? `https://huggingface.co/papers/${paper.paper.id}`
        : `https://arxiv.org/abs/${paper.paper?.arxivId || ''}`,
      publishedDate: paper.publishedAt || paper.paper?.publishedAt || '',
      likes: paper.paper?.upvotes || 0,
    }))
  } catch (error) {
    console.error('Error fetching AI papers:', (error as Error).message)
    return []
  }
}

// ============ Site Generation ============

function generateHtml(data: TrendingData): string {
  const now = new Date(data.fetchedAt)
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const langColors: Record<string, string> = {
    typescript: '#3178c6', python: '#3572A5', go: '#00ADD8', rust: '#dea584',
    javascript: '#f1e05a', java: '#b07219', c: '#555', 'c++': '#f34b7d',
    ruby: '#701516', php: '#4F5D95', swift: '#ffac45', kotlin: '#A97BFF',
    dart: '#00B4AB', lua: '#000080', haskell: '#5e5086', elixir: '#6e4a7e',
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"')
  }

  function ghRepoCard(r: GithubRepoType, i: number): string {
    const desc = r.description ? esc(r.description).slice(0, 100) : ''
    const lang = r.language || ''
    const color = langColors[lang.toLowerCase()] || '#6e7681'
    return `
    <div class="repo-card" style="--accent:${color}">
      <div class="repo-rank">#${i + 1}</div>
      <div class="repo-body">
        <div class="repo-title"><a href="https://github.com${r.link}" target="_blank" rel="noopener">${esc(r.title)}</a></div>
        <div class="repo-desc">${desc}${desc ? '' : 'No description'}</div>
        <div class="repo-meta">
          ${lang ? `<span class="repo-lang"><span class="lang-dot" style="background:${color}"></span>${esc(lang)}</span>` : ''}
          <span class="repo-stars">⭐ ${esc(r.stars)}</span>
          <span class="repo-today">+${esc(r.todayStars)} today</span>
        </div>
      </div>
    </div>`
  }

  let sections = ''

  // GitHub Trending
  const gh = data.githubTrending
  if (Object.keys(gh).length > 0) {
    // All languages
    const allRepos = gh.all || gh.All || gh[''] || []
    const otherLangs = Object.entries(gh).filter(([k]) => k && k.toLowerCase() !== 'all')

    sections += `<section class="section" id="github">
      <div class="section-header"><div class="section-icon">📦</div><div><h2>GitHub Trending</h2><p class="section-sub">Hot repositories across languages</p></div></div>`

    if (allRepos.length > 0) {
      sections += `<div class="lang-section">
        <h3 class="lang-title">All Languages</h3>
        <div class="repo-grid">${allRepos.map((r, i) => ghRepoCard(r, i)).join('')}</div>
      </div>`
    }

    for (const [lang, repos] of otherLangs) {
      if (repos.length === 0) continue
      sections += `<div class="lang-section">
        <h3 class="lang-title">${esc(lang)}</h3>
        <div class="repo-grid">${repos.map((r, i) => ghRepoCard(r, i)).join('')}</div>
      </div>`
    }
    sections += `</section>`
  }

  // HuggingFace
  if (data.huggingFaceModels && data.huggingFaceModels.length > 0) {
    sections += `<section class="section" id="huggingface">
      <div class="section-header"><div class="section-icon">🤖</div><div><h2>HuggingFace Hot Models</h2><p class="section-sub">Trending AI/ML models</p></div></div>
      <div class="model-grid">${data.huggingFaceModels.map((m, i) => `
        <div class="model-card">
          <div class="model-rank">#${i + 1}</div>
          <div class="model-name"><a href="${m.link}" target="_blank" rel="noopener">${esc(m.modelId)}</a></div>
          <div class="model-pipeline">${m.pipeline_tag ? esc(m.pipeline_tag) : 'general'}</div>
          <div class="model-stats">
            <span>📥 ${(m.downloads || 0).toLocaleString()}</span>
            <span>❤️ ${(m.likes || 0).toLocaleString()}</span>
          </div>
        </div>`).join('')}</div>
    </section>`
  }

  // Hacker News
  if (data.hackerNewsStories && data.hackerNewsStories.length > 0) {
    sections += `<section class="section" id="hackernews">
      <div class="section-header"><div class="section-icon">📰</div><div><h2>Hacker News Top Stories</h2><p class="section-sub">Top tech stories and discussions</p></div></div>
      <div class="hn-list">${data.hackerNewsStories.map((s, i) => {
        const timeAgo = Math.floor((Date.now() / 1000 - s.time) / 3600)
        return `
        <div class="hn-item">
          <div class="hn-score">${s.score}</div>
          <div class="hn-body">
            <div class="hn-title"><a href="${s.link}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
            <div class="hn-meta">by ${esc(s.by)} · ${timeAgo}h ago · ${s.descendants} comments</div>
          </div>
        </div>`
      }).join('')}</div>
    </section>`
  }

  // Dev.to
  if (data.devToArticles && data.devToArticles.length > 0) {
    sections += `<section class="section" id="devto">
      <div class="section-header"><div class="section-icon">📝</div><div><h2>Dev.to Popular Articles</h2><p class="section-sub">Trending developer articles</p></div></div>
      <div class="article-list">${data.devToArticles.map(a => `
        <div class="article-item">
          <div class="article-title"><a href="${a.url}" target="_blank" rel="noopener">${esc(a.title)}</a></div>
          <div class="article-meta">
            <span>by ${esc(a.user.name)}</span>
            <span>❤️ ${a.publicReactionsCount}</span>
            <span>💬 ${a.commentsCount}</span>
          </div>
          ${a.tags.length > 0 ? `<div class="article-tags">${a.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('')}</div>
    </section>`
  }

  // AI Papers
  if (data.aiPapers && data.aiPapers.length > 0) {
    sections += `<section class="section" id="papers">
      <div class="section-header"><div class="section-icon">📄</div><div><h2>Latest AI Research Papers</h2><p class="section-sub">Latest AI research from HuggingFace Daily Papers</p></div></div>
      <div class="paper-list">${data.aiPapers.map(p => {
        const authors = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '')
        return `
        <div class="paper-item">
          <div class="paper-title"><a href="${p.url}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
          <div class="paper-authors">👤 ${esc(authors)}</div>
          <div class="paper-abstract">${esc(p.abstract).slice(0, 150)}${p.abstract.length > 150 ? '...' : ''}</div>
          ${p.likes ? `<div class="paper-likes">❤️ ${p.likes}</div>` : ''}
        </div>`
      }).join('')}</div>
    </section>`
  }

  // Indie Revenue
  if (data.indieRevenue && data.indieRevenue.length > 0) {
    sections += `<section class="section" id="indie">
      <div class="section-header"><div class="section-icon">💰</div><div><h2>Indie Hackers Revenue</h2><p class="section-sub">Revenue reports and MRR insights</p></div></div>
      <div class="revenue-grid">${data.indieRevenue.map(r => {
        const founders = r.founders ? r.founders.join(', ') : ''
        return `
        <div class="revenue-card">
          <div class="revenue-header">
            <span class="revenue-rank">#${r.rank}</span>
            <span class="revenue-mrr">$${(r.mrr || 0).toLocaleString()}/mo</span>
          </div>
          <div class="revenue-name"><a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></div>
          ${r.description ? `<div class="revenue-desc">${esc(r.description)}</div>` : ''}
          <div class="revenue-footer">
            <span>ARR: $${(r.arr || 0).toLocaleString()}</span>
            ${founders ? `<span>👤 ${esc(founders)}</span>` : ''}
          </div>
        </div>`
      }).join('')}</div>
    </section>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tech Trending Daily - ${dateStr}</title>
<meta name="description" content="Daily trending tech content from GitHub, HuggingFace, Hacker News, Dev.to, AI Papers, and Indie Hackers">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0d1117;
  --bg-card: #161b22;
  --bg-card-hover: #1c2333;
  --text: #c9d1d9;
  --text-muted: #8b949e;
  --text-bright: #f0f6fc;
  --accent-blue: #58a6ff;
  --accent-green: #3fb950;
  --accent-orange: #f0883e;
  --accent-purple: #bc8cff;
  --accent-red: #f85149;
  --border: #30363d;
  --radius: 8px;
  --radius-lg: 12px;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
}
.container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }

/* Header */
header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 40px 0 30px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}
.header-content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.header-title { font-size: 28px; font-weight: 700; color: var(--text-bright); letter-spacing: -0.5px; }
.header-title span { background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.header-meta { color: var(--text-muted); font-size: 14px; }
.header-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.header-nav a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}
.header-nav a:hover { color: var(--text-bright); border-color: var(--accent-blue); background: rgba(88,166,255,0.1); }

/* Sections */
.section { margin: 24px 0; }
.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px 20px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
.section-icon { font-size: 28px; }
.section-header h2 { font-size: 20px; color: var(--text-bright); font-weight: 600; }
.section-sub { color: var(--text-muted); font-size: 13px; margin-top: 2px; }

/* GitHub Repos */
.lang-section { margin-bottom: 20px; }
.lang-title { color: var(--text-bright); font-size: 16px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
.repo-grid { display: grid; gap: 8px; }
.repo-card {
  display: flex;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: all 0.2s;
  border-left: 3px solid var(--accent, #6e7681);
}
.repo-card:hover { background: var(--bg-card-hover); border-color: var(--accent, #6e7681); }
.repo-rank { color: var(--text-muted); font-size: 13px; font-weight: 600; min-width: 28px; padding-top: 2px; }
.repo-body { flex: 1; min-width: 0; }
.repo-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.repo-title a { color: var(--accent-blue); text-decoration: none; }
.repo-title a:hover { text-decoration: underline; }
.repo-desc { color: var(--text-muted); font-size: 13px; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.repo-meta { display: flex; gap: 16px; align-items: center; font-size: 12px; color: var(--text-muted); }
.lang-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.repo-stars { color: #d29922; }

/* HuggingFace Models */
.model-grid { display: grid; gap: 8px; }
.model-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  transition: all 0.2s;
}
.model-card:hover { background: var(--bg-card-hover); }
.model-rank { color: var(--text-muted); font-size: 12px; font-weight: 600; min-width: 24px; }
.model-name { flex: 1; font-size: 14px; font-weight: 500; }
.model-name a { color: var(--accent-orange); text-decoration: none; }
.model-name a:hover { text-decoration: underline; }
.model-pipeline { color: var(--text-muted); font-size: 12px; padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 10px; }
.model-stats { display: flex; gap: 12px; color: var(--text-muted); font-size: 12px; }

/* Hacker News */
.hn-list { display: grid; gap: 6px; }
.hn-item {
  display: flex;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  transition: all 0.2s;
}
.hn-item:hover { background: var(--bg-card-hover); }
.hn-score {
  background: rgba(255,102,0,0.1);
  color: #ff6600;
  font-size: 14px;
  font-weight: 700;
  min-width: 40px;
  text-align: center;
  padding: 4px 0;
  border-radius: 4px;
  align-self: flex-start;
}
.hn-body { flex: 1; }
.hn-title { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
.hn-title a { color: var(--text-bright); text-decoration: none; }
.hn-title a:hover { color: var(--accent-orange); }
.hn-meta { color: var(--text-muted); font-size: 12px; }

/* Dev.to */
.article-list { display: grid; gap: 6px; }
.article-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: all 0.2s;
}
.article-item:hover { background: var(--bg-card-hover); }
.article-title { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
.article-title a { color: var(--accent-purple); text-decoration: none; }
.article-title a:hover { text-decoration: underline; }
.article-meta { display: flex; gap: 12px; color: var(--text-muted); font-size: 12px; margin-bottom: 6px; }
.article-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 2px 8px; background: rgba(188,140,255,0.1); color: var(--accent-purple); border-radius: 10px; }

/* AI Papers */
.paper-list { display: grid; gap: 6px; }
.paper-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: all 0.2s;
}
.paper-item:hover { background: var(--bg-card-hover); }
.paper-title { font-size: 15px; font-weight: 500; margin-bottom: 4px; }
.paper-title a { color: var(--accent-blue); text-decoration: none; }
.paper-title a:hover { text-decoration: underline; }
.paper-authors { color: var(--text-muted); font-size: 12px; margin-bottom: 6px; }
.paper-abstract { color: var(--text-muted); font-size: 13px; line-height: 1.5; }
.paper-likes { color: #f85149; font-size: 12px; margin-top: 6px; }

/* Indie Revenue */
.revenue-grid { display: grid; gap: 8px; }
.revenue-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent-green);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: all 0.2s;
}
.revenue-card:hover { background: var(--bg-card-hover); }
.revenue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.revenue-rank {
  background: var(--accent-green);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.revenue-mrr { font-size: 16px; font-weight: 700; color: var(--accent-green); }
.revenue-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.revenue-name a { color: var(--text-bright); text-decoration: none; }
.revenue-name a:hover { text-decoration: underline; }
.revenue-desc { color: var(--text-muted); font-size: 13px; margin-bottom: 8px; }
.revenue-footer { display: flex; gap: 16px; color: var(--text-muted); font-size: 12px; }

/* Footer */
footer {
  text-align: center;
  padding: 30px 20px;
  border-top: 1px solid var(--border);
  margin-top: 40px;
}
footer p { color: var(--text-muted); font-size: 13px; }
footer a { color: var(--accent-blue); text-decoration: none; }

/* Loading & Error states (not used in static pages) */
.loading { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Dark scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #484f58; }

/* Responsive */
@media (max-width: 640px) {
  .header-content { flex-direction: column; align-items: flex-start; }
  .header-nav { width: 100%; }
  .model-card { flex-wrap: wrap; }
  .model-stats { width: 100%; justify-content: flex-end; }
  .revenue-header { flex-direction: column; align-items: flex-start; gap: 6px; }
}

/* Count badge */
.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(88,166,255,0.1);
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 600;
  padding: 0 8px;
  height: 22px;
  border-radius: 10px;
  margin-left: 8px;
}
</style>
</head>
<body>

<header>
  <div class="header-content">
    <div>
      <div class="header-title"><span>Tech Trending</span> Daily</div>
      <div class="header-meta">Updated: ${dateStr} ${timeStr} UTC+8</div>
    </div>
    <div class="header-nav">
      ${data.githubTrending && Object.values(data.githubTrending).flat().length > 0 ? '<a href="#github">📦 GitHub</a>' : ''}
      ${data.huggingFaceModels?.length ? '<a href="#huggingface">🤖 HuggingFace</a>' : ''}
      ${data.hackerNewsStories?.length ? '<a href="#hackernews">📰 HN</a>' : ''}
      ${data.devToArticles?.length ? '<a href="#devto">📝 Dev.to</a>' : ''}
      ${data.aiPapers?.length ? '<a href="#papers">📄 Papers</a>' : ''}
      ${data.indieRevenue?.length ? '<a href="#indie">💰 Revenue</a>' : ''}
    </div>
  </div>
</header>

<main class="container">
  ${sections}

  <footer>
    <p>Generated by <a href="https://github.com/talljack/github-trending-email" target="_blank" rel="noopener">Tech Trending Daily</a> · ${dateStr}</p>
    <p style="margin-top: 4px;">Data from GitHub Trending, HuggingFace, Hacker News, Dev.to, and more</p>
  </footer>
</main>

<script>
// Update all "X hours ago" timestamps
document.querySelectorAll('[data-timestamp]').forEach(el => {
  const ts = parseInt(el.dataset.timestamp)
  const hours = Math.floor((Date.now()/1000 - ts)/3600)
  el.textContent = hours + 'h ago'
})
</script>
</body>
</html>`
}

// ============ Main ============

async function main() {
  console.log('🚀 Tech Trending Daily - Site Generator\n')

  const result: TrendingData = {
    githubTrending: {},
    fetchedAt: new Date().toISOString(),
  }

  // Fetch GitHub Trending
  console.log('📦 Fetching GitHub Trending...')
  const languages = ['', 'typescript', 'python', 'go', 'rust']
  for (const lang of languages) {
    const repos = await getTrendingReposByLanguage(lang)
    result.githubTrending[lang || 'all'] = repos
    console.log(`  ${lang || 'all'}: ${repos.length} repos`)
  }

  // Fetch all other data in parallel
  console.log('\n🤖 Fetching HuggingFace models...')
  result.huggingFaceModels = await getHuggingFaceModels(10)
  console.log(`  ${result.huggingFaceModels.length} models`)

  console.log('📰 Fetching Hacker News stories...')
  result.hackerNewsStories = await getHackerNewsStories(15)
  console.log(`  ${result.hackerNewsStories.length} stories`)

  console.log('📝 Fetching Dev.to articles...')
  result.devToArticles = await getDevToArticles(10)
  console.log(`  ${result.devToArticles.length} articles`)

  console.log('📄 Fetching AI papers...')
  result.aiPapers = await getAIPapers(10)
  console.log(`  ${result.aiPapers.length} papers`)

  // Generate HTML
  console.log('\n📄 Generating static site...')
  const html = generateHtml(result)

  // Write output
  const outputDir = path.resolve(__dirname, '../site')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  const indexPath = path.join(outputDir, 'index.html')
  fs.writeFileSync(indexPath, html, 'utf-8')
  console.log(`✅ Site generated: ${indexPath}`)
  console.log(`   Size: ${(html.length / 1024).toFixed(1)} KB`)

  // Write data as JSON for reference
  const dataPath = path.join(outputDir, 'data.json')
  fs.writeFileSync(dataPath, JSON.stringify(result, null, 2), 'utf-8')

  // Summary
  const totalItems =
    Object.values(result.githubTrending).flat().length +
    (result.huggingFaceModels?.length || 0) +
    (result.hackerNewsStories?.length || 0) +
    (result.devToArticles?.length || 0) +
    (result.aiPapers?.length || 0) +
    (result.indieRevenue?.length || 0)

  console.log(`\n📊 Summary: ${totalItems} items from 5 platforms`)
  console.log('✅ Done!')
}

main().catch(console.error)
