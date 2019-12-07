const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const token = localStorage.getItem("chatflow_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

export const api = {
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/api/auth/me"),
  users: (q = "") => request(`/api/users?q=${encodeURIComponent(q)}`),
  updateMe: (body) => request("/api/users/me", { method: "PUT", body: JSON.stringify(body) }),
  conversations: () => request("/api/conversations"),
  createConversation: (userId) => request("/api/conversations", { method: "POST", body: JSON.stringify({ userId }) }),
  messages: (id) => request(`/api/conversations/${id}/messages`),
  sendMessage: (id, body) => request(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),
  editMessage: (id, text) => request(`/api/messages/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteMessage: (id) => request(`/api/messages/${id}`, { method: "DELETE" }),
  groups: () => request("/api/groups"),
  createGroup: (body) => request("/api/groups", { method: "POST", body: JSON.stringify(body) })
};
export { API };
