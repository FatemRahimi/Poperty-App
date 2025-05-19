// utils/useSessionStorage.js
import { useState, useEffect } from "react";

const useSessionStorage = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  });

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

export default useSessionStorage;
