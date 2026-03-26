import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Search, Filter, Users, GraduationCap, Briefcase, Heart, Award, MessageCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FindMentors = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    college: '',
    department: '',
    skills: ''
  });
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [requestData, setRequestData] = useState({
    goals: '',
    message: ''
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    searchMentors();
  }, []);

  const searchMentors = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (filters.college) params.append('college', filters.college);
      if (filters.department) params.append('department', filters.department);
      if (filters.skills) params.append('skills', filters.skills);

      const response = await axios.get(`${API}/mentorship/find-mentors?${params.toString()}`);
      setMentors(response.data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    searchMentors();
  };

  const handleRequestMentorship = (mentor) => {
    setSelectedMentor(mentor);
    setShowRequestModal(true);
  };

  const handleSendRequest = async () => {
    if (!requestData.goals.trim()) {
      alert('Please enter your learning goals');
      return;
    }

    setSending(true);
    try {
      await axios.post(`${API}/mentorship/request`, {
        mentor_id: selectedMentor.id,
        goals: requestData.goals,
        message: requestData.message
      });
      
      setShowRequestModal(false);
      setRequestData({ goals: '', message: '' });
      alert('Mentorship request sent successfully!');
      searchMentors(); // Refresh list
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Find Mentors</h1>
          <p className="text-gray-600">Connect with alumni who can guide your journey</p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mentors by name or department..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </form>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">College</label>
                <input
                  type="text"
                  value={filters.college}
                  onChange={(e) => setFilters({...filters, college: e.target.value})}
                  placeholder="e.g., MIT"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <input
                  type="text"
                  value={filters.department}
                  onChange={(e) => setFilters({...filters, department: e.target.value})}
                  placeholder="e.g., Computer Science"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
                <input
                  type="text"
                  value={filters.skills}
                  onChange={(e) => setFilters({...filters, skills: e.target.value})}
                  placeholder="e.g., Python"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="mb-4">
          <p className="text-gray-600">
            {loading ? 'Searching...' : `${mentors.length} mentor${mentors.length !== 1 ? 's' : ''} available`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mentors.map((mentor) => (
              <div
                key={mentor.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                {/* Profile */}
                <div className="flex items-start gap-4 mb-4">
                  <div 
                    onClick={() => navigate(`/profile/${mentor.id}`)}
                    className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0 cursor-pointer"
                  >
                    {mentor.profile_picture ? (
                      <img src={mentor.profile_picture} alt={mentor.full_name} className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      mentor.full_name.charAt(0)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 
                      onClick={() => navigate(`/profile/${mentor.id}`)}
                      className="font-semibold text-gray-800 hover:text-blue-600 cursor-pointer truncate"
                    >
                      {mentor.full_name}
                    </h3>
                    {mentor.headline && (
                      <p className="text-sm text-gray-600 truncate">{mentor.headline}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                      <Heart className="w-3 h-3" />
                      <span>Available for mentorship</span>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{mentor.college}</span>
                  </div>
                  {mentor.department && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{mentor.department}</span>
                    </div>
                  )}
                  {mentor.graduation_year && (
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">Class of {mentor.graduation_year}</span>
                    </div>
                  )}
                </div>

                {/* Skills */}
                {mentor.skills && mentor.skills.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1">
                    {mentor.skills.slice(0, 3).map((skill, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                        {skill}
                      </span>
                    ))}
                    {mentor.skills.length > 3 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                        +{mentor.skills.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Request Button */}
                <button
                  onClick={() => handleRequestMentorship(mentor)}
                  className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 font-medium flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Request Mentorship
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && mentors.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No mentors found</p>
            <p className="text-sm text-gray-400">Try adjusting your search criteria</p>
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && selectedMentor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Request Mentorship</h2>
            <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50 rounded-lg">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">
                {selectedMentor.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{selectedMentor.full_name}</p>
                <p className="text-sm text-gray-600">{selectedMentor.headline}</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Learning Goals <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={requestData.goals}
                  onChange={(e) => setRequestData({...requestData, goals: e.target.value})}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="What do you hope to achieve through this mentorship?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message (Optional)
                </label>
                <textarea
                  value={requestData.message}
                  onChange={(e) => setRequestData({...requestData, message: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Introduce yourself and explain why you'd like this person as a mentor..."
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setRequestData({ goals: '', message: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendRequest}
                disabled={sending || !requestData.goals.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FindMentors;
