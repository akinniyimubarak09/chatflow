import jwt from "jsonwebtoken";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET || "chatflow-development-secret",
    { expiresIn: "7d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "chatflow-development-secret"
    );
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
