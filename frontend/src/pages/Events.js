import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Calendar, MapPin, Users, Clock, Plus, Video, Check, X, Minus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Events = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    event_type: 'networking',
    date: '',
    time: '',
    location: '',
    is_virtual: false,
    meeting_link: '',
    max_attendees: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`);
      setEvents(response.data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.date || !newEvent.time) {
      alert('Please fill in required fields');
      return;
    }

    setCreating(true);
    try {
      await axios.post(`${API}/events`, {
        ...newEvent,
        max_attendees: newEvent.max_attendees ? parseInt(newEvent.max_attendees) : null
      });
      
      setShowCreateModal(false);
      setNewEvent({
        title: '', description: '', event_type: 'networking', date: '', time: '',
        location: '', is_virtual: false, meeting_link: '', max_attendees: ''
      });
      loadEvents();
    } catch (err) {
      alert('Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  const handleRSVP = async (eventId, status) => {
    try {
      await axios.post(`${API}/events/${eventId}/rsvp`, { status });
      loadEvents();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to RSVP');
    }
  };

  const getEventTypeColor = (type) => {
    const colors = {
      workshop: 'bg-blue-100 text-blue-800',
      seminar: 'bg-purple-100 text-purple-800',
      networking: 'bg-green-100 text-green-800',
      social: 'bg-pink-100 text-pink-800',
      career_fair: 'bg-orange-100 text-orange-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Events</h1>
            <p className="text-gray-600">Discover and join campus events</p>
          </div>
          {(user?.role === 'alumni' || user?.role === 'admin') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Event
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((item) => (
              <div key={item.event.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getEventTypeColor(item.event.event_type)}`}>
                    {item.event.event_type.replace('_', ' ')}
                  </span>
                  {item.event.is_virtual && (
                    <Video className="w-5 h-5 text-blue-600" />
                  )}
                </div>

                <h2 className="text-xl font-bold text-gray-800 mb-3">{item.event.title}</h2>
                <p className="text-gray-700 text-sm mb-4 line-clamp-2">{item.event.description}</p>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {item.event.date} at {item.event.time}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {item.event.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {item.event.attendee_count} attending
                    {item.event.max_attendees && ` / ${item.event.max_attendees} max`}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  {!item.user_rsvp ? (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleRSVP(item.event.id, 'going')}
                        disabled={item.is_full}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Going
                      </button>
                      <button
                        onClick={() => handleRSVP(item.event.id, 'maybe')}
                        className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <Minus className="w-3 h-3" />
                        Maybe
                      </button>
                      <button
                        onClick={() => handleRSVP(item.event.id, 'not_going')}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        No
                      </button>
                    </div>
                  ) : (
                    <div className={`px-4 py-2 rounded-lg text-center text-sm font-medium ${
                      item.user_rsvp === 'going' ? 'bg-green-100 text-green-800' :
                      item.user_rsvp === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {item.user_rsvp === 'going' && '✓ You\'re going'}
                      {item.user_rsvp === 'maybe' && 'Maybe attending'}
                      {item.user_rsvp === 'not_going' && 'Not attending'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No upcoming events</p>
            {(user?.role === 'alumni' || user?.role === 'admin') && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create First Event
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Event</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Event Type</label>
                <select
                  value={newEvent.event_type}
                  onChange={(e) => setNewEvent({...newEvent, event_type: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="workshop">Workshop</option>
                  <option value="seminar">Seminar</option>
                  <option value="networking">Networking</option>
                  <option value="social">Social</option>
                  <option value="career_fair">Career Fair</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Event title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Event description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time *</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({...newEvent, time: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Room 101, Main Building"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newEvent.is_virtual}
                    onChange={(e) => setNewEvent({...newEvent, is_virtual: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Virtual Event</span>
                </label>
              </div>

              {newEvent.is_virtual && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Link</label>
                  <input
                    type="url"
                    value={newEvent.meeting_link}
                    onChange={(e) => setNewEvent({...newEvent, meeting_link: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="https://zoom.us/..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Attendees (optional)</label>
                <input
                  type="number"
                  value={newEvent.max_attendees}
                  onChange={(e) => setNewEvent({...newEvent, max_attendees: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty for unlimited"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEvent}
                disabled={creating}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
