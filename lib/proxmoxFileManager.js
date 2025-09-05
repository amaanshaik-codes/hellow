/**
 * Proxmox File Storage Manager for Hellow Chat
 * Handles file uploads, processing, and serving from Proxmox VMs
 * Integrates with Supabase for real-time file sharing notifications
 */

export class ProxmoxFileManager {
  constructor(config = {}) {
    this.config = {
      // Proxmox VM endpoints (you'll set these up)
      fileServerUrl: process.env.NEXT_PUBLIC_PROXMOX_FILE_SERVER || 'https://files.hellow.local',
      imageProcessorUrl: process.env.NEXT_PUBLIC_PROXMOX_IMAGE_PROCESSOR || 'https://images.hellow.local',
      maxFileSize: 50 * 1024 * 1024, // 50MB default
      allowedTypes: [
        // Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        // Documents
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // Audio/Video
        'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm',
        // Archives
        'application/zip', 'application/x-rar-compressed'
      ],
      ...config
    };
  }

  /**
   * Upload file to Proxmox storage
   */
  async uploadFile(file, options = {}) {
    try {
      console.log(`📤 [PROXMOX] Uploading file: ${file.name} (${this.formatFileSize(file.size)})`);
      
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', options.username || 'anonymous');
      formData.append('room', options.room || 'ammu-vero-private-room');
      formData.append('generateThumbnail', options.generateThumbnail || 'true');

      // Upload to Proxmox file server
      const response = await fetch(`${this.config.fileServerUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${options.jwtToken}`,
          'X-User': options.username
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ [PROXMOX] File uploaded successfully:`, result);

      return {
        success: true,
        fileData: {
          id: result.fileId,
          name: file.name,
          originalName: file.name,
          size: file.size,
          type: file.type,
          url: result.publicUrl,
          downloadUrl: result.downloadUrl,
          thumbnailUrl: result.thumbnailUrl,
          proxmoxPath: result.internalPath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: options.username
        }
      };

    } catch (error) {
      console.error(`❌ [PROXMOX] Upload error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process image (resize, compress, generate thumbnails)
   */
  async processImage(fileId, options = {}) {
    try {
      console.log(`🖼️ [PROXMOX] Processing image: ${fileId}`);
      
      const processOptions = {
        resize: options.resize || { width: 1920, height: 1080, quality: 85 },
        thumbnail: options.thumbnail || { width: 300, height: 300 },
        compress: options.compress !== false,
        ...options
      };

      const response = await fetch(`${this.config.imageProcessorUrl}/api/process/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.jwtToken}`
        },
        body: JSON.stringify(processOptions)
      });

      if (!response.ok) {
        throw new Error(`Image processing failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ [PROXMOX] Image processed successfully:`, result);

      return {
        success: true,
        processedImage: result
      };

    } catch (error) {
      console.error(`❌ [PROXMOX] Image processing error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file from Proxmox storage
   */
  async deleteFile(fileId, options = {}) {
    try {
      console.log(`🗑️ [PROXMOX] Deleting file: ${fileId}`);
      
      const response = await fetch(`${this.config.fileServerUrl}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${options.jwtToken}`,
          'X-User': options.username
        }
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      console.log(`✅ [PROXMOX] File deleted successfully: ${fileId}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ [PROXMOX] Delete error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get file info and metadata
   */
  async getFileInfo(fileId, options = {}) {
    try {
      const response = await fetch(`${this.config.fileServerUrl}/api/files/${fileId}/info`, {
        headers: {
          'Authorization': `Bearer ${options.jwtToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Get file info failed: ${response.status}`);
      }

      const fileInfo = await response.json();
      return {
        success: true,
        fileInfo
      };

    } catch (error) {
      console.error(`❌ [PROXMOX] Get file info error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate secure download link
   */
  async generateDownloadLink(fileId, options = {}) {
    try {
      const expiresIn = options.expiresIn || 3600; // 1 hour default
      
      const response = await fetch(`${this.config.fileServerUrl}/api/files/${fileId}/download-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.jwtToken}`
        },
        body: JSON.stringify({ expiresIn })
      });

      if (!response.ok) {
        throw new Error(`Generate download link failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        downloadLink: result.downloadUrl,
        expiresAt: result.expiresAt
      };

    } catch (error) {
      console.error(`❌ [PROXMOX] Generate download link error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(file) {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      return {
        valid: false,
        error: `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(this.config.maxFileSize)})`
      };
    }

    // Check file type
    if (!this.config.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type "${file.type}" is not allowed`
      };
    }

    // Check file name
    if (file.name.length > 255) {
      return {
        valid: false,
        error: 'File name is too long (max 255 characters)'
      };
    }

    // Basic security check
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.vbs', '.js'];
    const fileName = file.name.toLowerCase();
    
    for (const ext of dangerousExtensions) {
      if (fileName.endsWith(ext)) {
        return {
          valid: false,
          error: `File extension "${ext}" is not allowed for security reasons`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file type category for UI
   */
  getFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('text')) return 'document';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    return 'file';
  }

  /**
   * Generate file icon based on type
   */
  getFileIcon(mimeType) {
    const category = this.getFileCategory(mimeType);
    
    const icons = {
      image: '🖼️',
      video: '🎥',
      audio: '🎵',
      pdf: '📄',
      document: '📝',
      archive: '📦',
      file: '📁'
    };
    
    return icons[category] || icons.file;
  }

  /**
   * Check if file type supports thumbnail generation
   */
  supportsThumbnails(mimeType) {
    return mimeType.startsWith('image/') || 
           mimeType.startsWith('video/') ||
           mimeType === 'application/pdf';
  }
}

export default ProxmoxFileManager;
