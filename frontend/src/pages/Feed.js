import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Plus, Heart, MessageCircle, Bookmark, Share2, MoreVertical } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Feed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    post_type: 'blog',
    tags: '',
    visibility: 'public'
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadFeed();
  }, [filter]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('post_type', filter);
      
      const response = await axios.get(`${API}/posts/feed?${params.toString()}`);
      setPosts(response.data);
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.title.trim() || !newPost.content.trim()) {
      alert('Please fill in title and content');
      return;
    }

    setCreating(true);
    try {
      await axios.post(`${API}/posts`, {
        ...newPost,
        tags: newPost.tags ? newPost.tags.split(',').map(t => t.trim()) : []
      });
      
      setShowCreateModal(false);
      setNewPost({ title: '', content: '', post_type: 'blog', tags: '', visibility: 'public' });
      loadFeed();
    } catch (err) {
      alert('Failed to create post');
    } finally {
      setCreating(false);
    }
  };

  const handleLike = async (postId) => {
    try {
      await axios.post(`${API}/posts/${postId}/like`);
      loadFeed();
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  };

  const handleBookmark = async (postId) => {
    try {
      await axios.post(`${API}/posts/${postId}/bookmark`);
      loadFeed();
    } catch (err) {
      console.error('Failed to bookmark post:', err);
    }
  };

  const getPostTypeColor = (type) => {
    switch(type) {
      case 'blog': return 'bg-blue-100 text-blue-800';
      case 'discussion': return 'bg-purple-100 text-purple-800';
      case 'achievement': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Community Feed</h1>
            <p className="text-gray-600">Share knowledge and connect with your community</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 font-medium flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Post
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {['all', 'blog', 'discussion', 'achievement'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((item) => (
              <div key={item.post.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {/* Author */}
                <div className="flex items-center justify-between mb-4">
                  <div 
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => navigate(`/profile/${item.author.id}`)}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      {item.author.profile_picture ? (
                        <img src={item.author.profile_picture} alt={item.author.full_name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        item.author.full_name.charAt(0)
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 hover:text-blue-600">{item.author.full_name}</p>
                      <p className="text-sm text-gray-500">{new Date(item.post.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getPostTypeColor(item.post.post_type)}`}>
                    {item.post.post_type}
                  </span>
                </div>

                {/* Content */}
                <div 
                  onClick={() => navigate(`/posts/${item.post.id}`)}
                  className="cursor-pointer"
                >
                  <h2 className="text-xl font-bold text-gray-800 mb-3 hover:text-blue-600">{item.post.title}</h2>
                  <p className="text-gray-700 mb-4 line-clamp-3">{item.post.content}</p>
                </div>

                {/* Tags */}
                {item.post.tags && item.post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {item.post.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleLike(item.post.id)}
                    className={`flex items-center gap-2 ${item.is_liked ? 'text-red-600' : 'text-gray-600 hover:text-red-600'} transition-colors`}
                  >
                    <Heart className={`w-5 h-5 ${item.is_liked ? 'fill-current' : ''}`} />
                    <span className="text-sm font-medium">{item.post.like_count}</span>
                  </button>
                  <button
                    onClick={() => navigate(`/posts/${item.post.id}`)}
                    className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.post.comment_count}</span>
                  </button>
                  <button
                    onClick={() => handleBookmark(item.post.id)}
                    className={`flex items-center gap-2 ${item.is_bookmarked ? 'text-yellow-600' : 'text-gray-600 hover:text-yellow-600'} transition-colors`}
                  >
                    <Bookmark className={`w-5 h-5 ${item.is_bookmarked ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No posts yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Post
            </button>
          </div>
        )}
      </div>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Post</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Post Type</label>
                <div className="grid grid-cols-3 gap-3">
                  {['blog', 'discussion', 'achievement'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewPost({...newPost, post_type: type})}
                      className={`py-2 px-4 rounded-lg font-medium capitalize ${
                        newPost.post_type === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={(e) => setNewPost({...newPost, title: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Give your post a title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content *</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Share your thoughts, ideas, or achievements..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newPost.tags}
                  onChange={(e) => setNewPost({...newPost, tags: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., technology, career, coding"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
                <select
                  value={newPost.visibility}
                  onChange={(e) => setNewPost({...newPost, visibility: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="public">Public</option>
                  <option value="connections">Connections Only</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewPost({ title: '', content: '', post_type: 'blog', tags: '', visibility: 'public' });
                }}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={creating}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
              >
                {creating ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Feed;
