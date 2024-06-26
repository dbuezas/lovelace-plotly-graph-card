import { Octokit } from "@octokit/core";

const owner = "dbuezas";
const repo = "lovelace-plotly-graph-card";
const auth = "github_pat_xxx"; // create from https://github.com/settings/tokens
import fetch from "node-fetch";

const octokit = new Octokit({
  request: {
    fetch: fetch,
  },
  auth,
});

async function fetchDiscussions(owner, repo, cursor) {
  const query = `
      query ($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          discussions(first: 100, after: $cursor) {
            totalCount
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              id
              title
              url
              body
              comments(first: 70) {
                totalCount
                nodes {
                  id
                  body
                  createdAt
                  replies(first: 70) {
                    totalCount
                    nodes {
                      body
                    }
                  }
                }
                pageInfo {
                  endCursor
                  hasNextPage
                }
              }
            }
          }
        }
      }
    `;

  const response = await octokit.graphql(query, {
    owner,
    repo,
    cursor,
  });

  // console.log(JSON.stringify(response, 0, 2));
  function extractImageUrls(markdown) {
    const imageUrls = [];
    // This regex specifically matches URLs starting with the specified GitHub path
    const regexes = [/!\[.*?\]\((.*?)\)/g, /src="([^"]+)"/g];
    for (const regex of regexes) {
      let match;
      while ((match = regex.exec(markdown)) !== null) {
        imageUrls.push(match[1]);
      }
    }
    return imageUrls;
  }
  const data = response.repository.discussions.nodes
    .map(({ title, url, body, comments }) => {
      const images = extractImageUrls(body);
      for (const comment of comments.nodes) {
        images.push(...extractImageUrls(comment.body));
        for (const reply of comment.replies.nodes) {
          images.push(...extractImageUrls(reply.body));
        }
      }
      return { title, url, images };
    })
    .filter(({ images }) => images.length);

  const md = data.map(({ title, url, images }) => {
    let groups = [];
    let group = [];
    groups.push(group);
    for (let i = 0; i < images.length; i++) {
      if (i % 4 === 0) {
        group = [];
        groups.push(group);
      }
      group.push(images[i]);
    }

    let txt = "";
    for (const group of groups) {
      if (group.length === 0) continue;
      txt += "<tr>\n";
      for (const img of group) {
        txt += `<td><img src="${img}" width="200" /></td>\n`;
      }
      txt += "</tr>\n";
    }
    return `
## [${title}](${url})
<table>
${txt}
</table>

---`;
  });

  return {
    md: md.join("\n"),
    next: response.repository.discussions.pageInfo.endCursor,
  };
}

let { md, next } = await fetchDiscussions(owner, repo, null);
let result = md;
while (next) {
  console.log(next);
  let xx = await fetchDiscussions(owner, repo, next);
  result += "\n" + xx.md;
  next = xx.next;
}

console.log(result);
