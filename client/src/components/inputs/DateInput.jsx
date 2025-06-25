import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "./DateInput.css";

const DateInput = ({ 
  label, 
  name, 
  value, 
  onChange, 
  placeholder = "Select date",
  required = false,
  disabled = false,
  className = "",
  ...props 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState("");
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const datePickerRef = useRef(null);
  const inputRef = useRef(null);

  // Format date for display
  const formatDisplayDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  };

  // Parse display date back to ISO format
  const parseDisplayDate = (displayStr) => {
    if (!displayStr) return "";
    const parts = displayStr.split('/');
    if (parts.length !== 3) return "";
    
    const [day, month, year] = parts;
    const date = new Date(year, month - 1, day);
    
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split('T')[0];
  };

  // Update display value when prop value changes
  useEffect(() => {
    setDisplayValue(formatDisplayDate(value));
  }, [value]);



  // Close picker when clicking outside and handle window resize
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside both the input container and the date picker
      if (
        datePickerRef.current && !datePickerRef.current.contains(event.target) &&
        inputRef.current && !inputRef.current.parentNode.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleWindowResize = () => {
      if (isOpen) {
        const position = calculatePickerPosition();
        setPickerPosition(position);
      }
    };

    const handleScroll = () => {
      if (isOpen) {
        const position = calculatePickerPosition();
        setPickerPosition(position);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", handleWindowResize);
      window.addEventListener("scroll", handleScroll, true); // Capture scroll events
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("resize", handleWindowResize);
        window.removeEventListener("scroll", handleScroll, true);
      };
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);

    // Try to parse and convert to ISO format
    const isoDate = parseDisplayDate(inputValue);
    if (isoDate) {
      const syntheticEvent = {
        target: {
          name: name,
          value: isoDate
        }
      };
      onChange(syntheticEvent);
    }
  };

  const handleDateSelect = (selectedDate) => {
    const isoDate = selectedDate.toISOString().split('T')[0];
    const syntheticEvent = {
      target: {
        name: name,
        value: isoDate
      }
    };
    onChange(syntheticEvent);
    setIsOpen(false);
  };

  const calculatePickerPosition = () => {
    if (!inputRef.current) return { top: 0, left: 0 };
    
    const rect = inputRef.current.getBoundingClientRect();
    const pickerWidth = 280; // min-width from CSS
    const pickerHeight = 320; // estimated height
    const padding = 8; // padding from screen edges
    
    let top = rect.bottom + 8; // Position below the input with spacing
    let left = rect.right - pickerWidth; // Align with right edge of input
    
    // Adjust if picker would go off right edge of screen
    if (left + pickerWidth > window.innerWidth - padding) {
      left = window.innerWidth - pickerWidth - padding;
    }
    
    // Adjust if picker would go off left edge of screen
    if (left < padding) {
      left = padding;
    }
    
    // Adjust if picker would go off bottom edge of screen
    if (top + pickerHeight > window.innerHeight - padding) {
      // Position above the input instead
      top = rect.top - pickerHeight - 8;
    }
    
    // If positioning above would go off top of screen, try to the right
    if (top < padding) {
      top = rect.top;
      left = rect.right + 8;
      
      // If right positioning would go off screen, go back to below but keep it on screen
      if (left + pickerWidth > window.innerWidth - padding) {
        top = rect.bottom + 8;
        left = rect.left;
        
        // Adjust final position to fit on screen
        if (left + pickerWidth > window.innerWidth - padding) {
          left = window.innerWidth - pickerWidth - padding;
        }
        if (top + pickerHeight > window.innerHeight - padding) {
          top = window.innerHeight - pickerHeight - padding;
        }
      }
    }
    
    return { top, left };
  };

  const togglePicker = () => {
    if (!disabled) {
      if (!isOpen) {
        const position = calculatePickerPosition();
        setPickerPosition(position);
      }
      setIsOpen(!isOpen);
    }
  };

  const handleInputFocus = () => {
    const position = calculatePickerPosition();
    setPickerPosition(position);
    setIsOpen(true);
  };

  // Generate calendar dates
  const generateCalendarDates = () => {
    const today = new Date();
    const currentDate = value ? new Date(value) : today;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const dates = [];
    const current = new Date(startDate);

    for (let i = 0; i < 42; i++) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return { dates, currentMonth: month, currentYear: year };
  };

  const { dates, currentMonth, currentYear } = generateCalendarDates();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const navigateMonth = (direction) => {
    const currentDate = value ? new Date(value) : new Date();
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, currentDate.getDate());
    
    const syntheticEvent = {
      target: {
        name: name,
        value: newDate.toISOString().split('T')[0]
      }
    };
    onChange(syntheticEvent);
  };

  return (
    <div className="form-group">
      <label htmlFor={name} className="form-label">
        {label} {required && <span style={{ color: "red" }}>*</span>}
      </label>
      
      <div className="custom-date-input-container" ref={datePickerRef}>
        <div className="custom-date-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            id={name}
            name={name}
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={`form-input-base focus-ring custom-date-input ${className}`}
            autoComplete="off"
            {...props}
          />
          <button
            type="button"
            className="custom-date-toggle"
            onClick={togglePicker}
            disabled={disabled}
            tabIndex={-1}
          >
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M7 10h5v5H7v-5zm12-4h-1V4c0-.55-.45-1-1-1s-1 .45-1 1v2H8V4c0-.55-.45-1-1-1s-1 .45-1 1v2H5c-1.1 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H5V10h14v8z" 
                fill="#6b7280"
              />
            </svg>
          </button>
        </div>

                {isOpen && createPortal(
          <div 
            className="custom-date-picker"
            style={{
              top: `${pickerPosition.top}px`,
              left: `${pickerPosition.left}px`
            }}
            ref={datePickerRef}
          >
            <div className="date-picker-header">
              <button
                type="button"
                className="date-nav-button"
                onClick={() => navigateMonth(-1)}
              >
                ‹
              </button>
              <span className="date-picker-month">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <button
                type="button"
                className="date-nav-button"
                onClick={() => navigateMonth(1)}
              >
                ›
              </button>
            </div>

            <div className="date-picker-weekdays">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => (
                <div key={day} className="date-picker-weekday">
                  {day}
                </div>
              ))}
            </div>

            <div className="date-picker-dates">
              {dates.map((date, index) => {
                const isCurrentMonth = date.getMonth() === currentMonth;
                const isSelected = value && date.toISOString().split('T')[0] === value;
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <button
                    key={index}
                    type="button"
                    className={`date-picker-date ${
                      isCurrentMonth ? 'current-month' : 'other-month'
                    } ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => handleDateSelect(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};

export default DateInput; 