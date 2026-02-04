import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const STORAGE_KEY = "connectltv_auth_timestamp";
const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PasswordGateProps {
  children: React.ReactNode;
}

const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const storedTimestamp = localStorage.getItem(STORAGE_KEY);
    if (storedTimestamp) {
      const elapsed = Date.now() - parseInt(storedTimestamp, 10);
      if (elapsed < EXPIRATION_MS) {
        setIsAuthenticated(true);
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsAuthenticated(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = import.meta.env.VITE_APP_PASSWORD;

    if (password === correctPassword) {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  // Show nothing while checking localStorage
  if (isAuthenticated === null) {
    return null;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Lock className="w-12 h-12 text-harvard-crimson" />
          </div>
          <h1 className="text-3xl font-bold text-harvard-crimson mb-2">ConnectLTV</h1>
          <p className="text-gray-600">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Password"
              className={`h-12 text-base ${error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-500">Incorrect password</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full h-12 bg-harvard-crimson hover:bg-harvard-crimson-light text-white"
          >
            Enter
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PasswordGate;
