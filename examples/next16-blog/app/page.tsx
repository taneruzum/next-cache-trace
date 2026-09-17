import { getPosts } from './data';
import { refreshPosts } from './actions';
export default async function Page() {
  const posts = await getPosts();
  return <main><p>next-cache-trace demo</p><h1>Follow a tag from read to refresh.</h1>{posts.map(post=><article key={post.id}><h2>{post.title}</h2><p>{post.body}</p></article>)}<form action={refreshPosts}><button type="submit">Invalidate posts</button></form></main>;
}
