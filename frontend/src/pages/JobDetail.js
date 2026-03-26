import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { 
  ArrowLeft, Briefcase, Building, MapPin, DollarSign, Clock, 
  Calendar, CheckCircle, FileText, Send
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const JobDetail = () => {
  const { jobId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationData, setApplicationData] = useState({
    cover_letter: '',
    resume_url: ''
  });
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    loadJob();
    checkIfApplied();
  }, [jobId]);

  const loadJob = async () => {
    try {
      const response = await axios.get(`${API}/jobs/${jobId}`);
      setJob(response.data);
    } catch (err) {
      console.error('Failed to load job:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkIfApplied = async () => {
    try {
      const response = await axios.get(`${API}/applications/my`);
      const applied = response.data.some(app => app.job.id === jobId);
      setHasApplied(applied);
    } catch (err) {
      console.error('Failed to check application status:', err);
    }
  };

  const handleApply = async () => {
    if (!applicationData.cover_letter.trim()) {
      alert('Please write a cover letter');
      return;
    }

    setApplying(true);
    try {
      await axios.post(`${API}/jobs/${jobId}/apply`, {
        job_id: jobId,
        cover_letter: applicationData.cover_letter,
        resume_url: applicationData.resume_url || null
      });
      
      alert('Application submitted successfully!');
      setShowApplicationModal(false);
      setHasApplied(true);
      setApplicationData({ cover_letter: '', resume_url: '' });
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  const getJobTypeColor = (type) => {
    switch(type) {
      case 'full-time': return 'bg-blue-100 text-blue-800';
      case 'part-time': return 'bg-green-100 text-green-800';
      case 'internship': return 'bg-purple-100 text-purple-800';
      case 'contract': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatJobType = (type) => {
    return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Job not found</p>
          <button onClick={() => navigate('/jobs')} className="text-blue-600 hover:underline">
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button onClick={() => navigate('/jobs')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
            Back to Jobs
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Job Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex items-start gap-6 mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800 mb-3">{job.title}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  <span className="font-medium">{job.company}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {job.location}
                </div>
                {job.salary_range && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    {job.salary_range}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Posted {new Date(job.posted_at).toLocaleDateString()}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getJobTypeColor(job.job_type)}`}>
                  {formatJobType(job.job_type)}
                </span>
                {job.experience_level && (
                  <span className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                    {job.experience_level}
                  </span>
                )}
                {job.category && (
                  <span className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                    {job.category}
                  </span>
                )}
              </div>

              {hasApplied ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg inline-flex">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Application Submitted</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowApplicationModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 font-medium"
                >
                  Apply Now
                </button>
              )}
            </div>
          </div>

          {job.application_deadline && (
            <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Calendar className="w-5 h-5 text-yellow-700" />
              <span className="text-sm text-yellow-700">
                <strong>Application Deadline:</strong> {job.application_deadline}
              </span>
            </div>
          )}
        </div>

        {/* Job Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Job Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap mb-6">{job.description}</p>

          {job.responsibilities && (
            <>
              <h3 className="text-xl font-bold text-gray-800 mb-3">Responsibilities</h3>
              <p className="text-gray-700 whitespace-pre-wrap mb-6">{job.responsibilities}</p>
            </>
          )}

          {job.requirements && (
            <>
              <h3 className="text-xl font-bold text-gray-800 mb-3">Requirements</h3>
              <p className="text-gray-700 whitespace-pre-wrap mb-6">{job.requirements}</p>
            </>
          )}

          {job.skills_required && job.skills_required.length > 0 && (
            <>
              <h3 className="text-xl font-bold text-gray-800 mb-3">Required Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.skills_required.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Application Modal */}
      {showApplicationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Apply for {job.title}</h2>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Building className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-semibold text-gray-800">{job.company}</p>
                  <p className="text-sm text-gray-600">{job.location}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cover Letter <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={applicationData.cover_letter}
                  onChange={(e) => setApplicationData({...applicationData, cover_letter: e.target.value})}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Tell us why you're a great fit for this role..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resume URL (Optional)
                </label>
                <input
                  type="url"
                  value={applicationData.resume_url}
                  onChange={(e) => setApplicationData({...applicationData, resume_url: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://drive.google.com/..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Provide a link to your resume (Google Drive, Dropbox, etc.)
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowApplicationModal(false);
                  setApplicationData({ cover_letter: '', resume_url: '' });
                }}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying || !applicationData.cover_letter.trim()}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                {applying ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetail;
