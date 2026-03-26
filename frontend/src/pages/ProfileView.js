import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { 
  Mail, MapPin, Phone, Link as LinkIcon, Briefcase, 
  GraduationCap, Award, Code, Heart, Edit, ArrowLeft,
  Linkedin, Github, Twitter, Globe, Calendar, Building,
  UserPlus, UserCheck, UserX, Clock
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ProfileView = () => {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    loadProfile();
    if (!isOwnProfile) {
      loadConnectionStatus();
    }
  }, [userId]);

  const loadProfile = async () => {
    try {
      const response = await axios.get(`${API}/profile/${userId}`);
      setProfileData(response.data);
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadConnectionStatus = async () => {
    try {
      const response = await axios.get(`${API}/connections/status/${userId}`);
      setConnectionStatus(response.data);
    } catch (err) {
      console.error('Failed to load connection status:', err);
    }
  };

  const handleSendRequest = async () => {
    setSendingRequest(true);
    try {
      await axios.post(`${API}/connections/request`, {
        receiver_id: userId,
        message: `Hi! I'd like to connect with you.`
      });
      loadConnectionStatus();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send connection request');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async () => {
    try {
      await axios.put(`${API}/connections/${connectionStatus.connection.id}/accept`);
      loadConnectionStatus();
    } catch (err) {
      alert('Failed to accept request');
    }
  };

  const handleRejectRequest = async () => {
    try {
      await axios.put(`${API}/connections/${connectionStatus.connection.id}/reject`);
      loadConnectionStatus();
    } catch (err) {
      alert('Failed to reject request');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Profile not found'}</p>
          <button onClick={() => navigate(-1)} className="text-blue-600 hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { user, profile } = profileData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
          <div className="flex gap-2">
            {!isOwnProfile && connectionStatus && (
              <>
                {connectionStatus.status === 'none' && (
                  <button 
                    onClick={handleSendRequest}
                    disabled={sendingRequest}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    {sendingRequest ? 'Sending...' : 'Connect'}
                  </button>
                )}
                {connectionStatus.status === 'pending' && !connectionStatus.is_sender && (
                  <div className="flex gap-2">
                    <button 
                      onClick={handleAcceptRequest}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <UserCheck className="w-4 h-4" />
                      Accept
                    </button>
                    <button 
                      onClick={handleRejectRequest}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <UserX className="w-4 h-4" />
                      Decline
                    </button>
                  </div>
                )}
                {connectionStatus.status === 'pending' && connectionStatus.is_sender && (
                  <button 
                    disabled
                    className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
                  >
                    <Clock className="w-4 h-4" />
                    Request Pending
                  </button>
                )}
                {connectionStatus.status === 'accepted' && (
                  <button 
                    disabled
                    className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg cursor-default"
                  >
                    <UserCheck className="w-4 h-4" />
                    Connected
                  </button>
                )}
              </>
            )}
            {isOwnProfile && (
              <button 
                onClick={() => navigate('/profile/edit')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Edit className="w-4 h-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-start gap-6">
            {/* Profile Picture */}
            <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center text-white text-4xl font-bold flex-shrink-0">
              {profile.profile_picture ? (
                <img src={profile.profile_picture} alt={user.full_name} className="w-full h-full rounded-2xl object-cover" />
              ) : (
                user.full_name.charAt(0)
              )}
            </div>

            {/* Basic Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">{user.full_name}</h1>
              {profile.headline && (
                <p className="text-lg text-gray-600 mb-3">{profile.headline}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  {user.college}
                </div>
                {user.department && (
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    {user.department}
                  </div>
                )}
                {user.graduation_year && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Class of {user.graduation_year}
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {profile.location}
                  </div>
                )}
              </div>

              {/* Role Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full">
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                <span className="text-sm font-medium text-blue-800 capitalize">{user.role}</span>
              </div>

              {profile.available_for_mentorship && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full ml-2">
                  <Heart className="w-3 h-3 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Available for Mentorship</span>
                </div>
              )}
            </div>
          </div>

          {/* Contact & Social */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex flex-wrap gap-4">
              {user.email && (
                <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Mail className="w-4 h-4" />
                  <span className="text-sm">{user.email}</span>
                </a>
              )}
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{profile.phone}</span>
                </a>
              )}
              {profile.social_links?.linkedin && (
                <a href={profile.social_links.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Linkedin className="w-4 h-4" />
                  <span className="text-sm">LinkedIn</span>
                </a>
              )}
              {profile.social_links?.github && (
                <a href={profile.social_links.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Github className="w-4 h-4" />
                  <span className="text-sm">GitHub</span>
                </a>
              )}
              {profile.social_links?.twitter && (
                <a href={profile.social_links.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Twitter className="w-4 h-4" />
                  <span className="text-sm">Twitter</span>
                </a>
              )}
              {profile.social_links?.website && (
                <a href={profile.social_links.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 hover:text-blue-600">
                  <Globe className="w-4 h-4" />
                  <span className="text-sm">Website</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* About */}
        {profile.bio && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">About</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {/* Skills */}
        {profile.skills && profile.skills.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, index) => (
                <span key={index} className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {profile.education && profile.education.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <GraduationCap className="w-6 h-6" />
              Education
            </h2>
            <div className="space-y-4">
              {profile.education.map((edu) => (
                <div key={edu.id} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-gray-800">{edu.degree}</h3>
                  <p className="text-gray-600">{edu.institution}</p>
                  {edu.field_of_study && <p className="text-sm text-gray-500">{edu.field_of_study}</p>}
                  <p className="text-sm text-gray-500">
                    {edu.start_year} - {edu.end_year || 'Present'}
                  </p>
                  {edu.description && <p className="text-gray-700 mt-2">{edu.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Work Experience */}
        {profile.work_experience && profile.work_experience.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Briefcase className="w-6 h-6" />
              Work Experience
            </h2>
            <div className="space-y-4">
              {profile.work_experience.map((work) => (
                <div key={work.id} className="border-l-4 border-purple-500 pl-4">
                  <h3 className="font-semibold text-gray-800">{work.position}</h3>
                  <p className="text-gray-600">{work.company}</p>
                  {work.location && <p className="text-sm text-gray-500">{work.location}</p>}
                  <p className="text-sm text-gray-500">
                    {work.start_date} - {work.current ? 'Present' : work.end_date}
                  </p>
                  {work.description && <p className="text-gray-700 mt-2">{work.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {profile.projects && profile.projects.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Code className="w-6 h-6" />
              Projects
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.projects.map((project) => (
                <div key={project.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-2">{project.title}</h3>
                  <p className="text-sm text-gray-700 mb-3">{project.description}</p>
                  {project.technologies && project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {project.technologies.map((tech, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                  {project.link && (
                    <a href={project.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      View Project
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        {profile.achievements && profile.achievements.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Award className="w-6 h-6" />
              Achievements
            </h2>
            <div className="space-y-3">
              {profile.achievements.map((achievement) => (
                <div key={achievement.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{achievement.title}</h3>
                    <p className="text-sm text-gray-700">{achievement.description}</p>
                    {achievement.date && <p className="text-xs text-gray-500 mt-1">{achievement.date}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileView;