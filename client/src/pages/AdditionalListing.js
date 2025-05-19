import React, { useState } from 'react';
import "../styles/AddList.css";  // Use existing AddList styling conventions
import { Link } from 'react-router-dom';
import useSessionStorage from "../Utils/useSessionStorage";
import { useParams } from 'react-router-dom';



function AdditionalListing() {

  const { type } = useParams();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Handle adding files from input or drop
  const handleFilesAdded = (fileList) => {
    const filesArray = Array.from(fileList);
    // Filter to include only image or video files (JPEG, PNG, MP4, etc.)
    const validFiles = filesArray.filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (validFiles.length) {
      // Append new files to existing list (allows multiple selections)
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
    }
  };

  // File input change handler
  const onFileChange = (e) => {
    handleFilesAdded(e.target.files);
  };

  // Drag-and-drop event handlers
  const onDragEnter = (e) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    // Indicate drag-over state (prevent default to allow drop)
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  // Remove a selected file from the list
  const removeFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="addleasing-container">
         <div className="form-title">
           <div className="form-title-brand">Sh.R.Property</div>
           <div className="form-title-add">ADD LISTING FOR LEASE</div>
           <ul className="form-title-find-link">
             <li><Link to="/seller">Add for Sale</Link></li>
           </ul>
         </div> 
      <div className="form-wrapper">
    

      {/* Form content */}
      <form className="form-content" onSubmit={(e) => e.preventDefault()}>
        {/* Property Description */}
        <div className="form-group">
          <label htmlFor="description" className="form-label">Property Description</label>
          <textarea
            id="description"
            className="form-textarea"
            rows="5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter detailed description of the property"
            required
          />
        </div>

        {/* Photos and Videos Upload */}
        <div className="form-group">
          <label className="form-label">Photos and Videos</label>
          <div className="upload-section">
            {/* Hidden file input (can use for both click and drop) */}
            <input
              type="file"
              id="fileInput"
              multiple
              accept="image/jpeg, image/png, video/mp4"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
            {/* Drop zone area */}
            <label
              htmlFor="fileInput"
              className={`drop-zone ${dragActive ? 'drag-over' : ''}`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              Drag &amp; drop photos or videos here, or click to select files
            </label>

            {/* Preview thumbnails and file names */}
            {files.length > 0 && (
              <div className="preview-list">
                {files.map((file, index) => (
                  <div key={index} className="preview-item">
                    {file.type.startsWith('image/') ? (
                      /* Image thumbnail preview */
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt={`Preview ${index + 1}`} 
                        className="preview-image" 
                      />
                    ) : (
                      /* Video file name display */
                      <div className="preview-video">
                        <span className="video-filename">{file.name}</span>
                      </div>
                    )}
                    {/* Remove file button */}
                    <button 
                      type="button" 
                      className="remove-btn" 
                      onClick={() => removeFile(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Form action buttons */}
        <div className="form-actions">
          <a href="/addleasenext" className="btn-back">Back to Previous Step</a>
          <button type="submit" className="btn-submit">Submit</button>
        </div>
      </form>
    </div>
 </div>
  );
}

export default AdditionalListing;
