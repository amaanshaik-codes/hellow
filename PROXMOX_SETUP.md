# Proxmox File Server Setup for Hellow Chat

This guide shows you how to set up file storage and processing servers on Proxmox to complement your Supabase real-time messaging.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vercel App    │    │   Supabase      │    │   Proxmox VMs   │
│                 │    │                 │    │                 │
│ • Next.js UI    │◄──►│ • Real-time DB  │◄──►│ • File Storage  │
│ • JWT Auth      │    │ • Messaging     │    │ • Image Proc    │
│ • API Routes    │    │ • Presence      │    │ • Media Server  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 VM 1: File Storage Server

### System Requirements
- **OS**: Ubuntu 22.04 LTS
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 500GB+ for file storage
- **CPU**: 2 cores minimum

### Installation Steps

1. **Create VM in Proxmox**
```bash
# In Proxmox web interface:
# - Create new VM
# - Assign resources as above
# - Install Ubuntu 22.04
```

2. **Install Node.js and Dependencies**
```bash
# SSH into your VM
ssh user@your-vm-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install additional tools
sudo apt install -y nginx certbot python3-certbot-nginx
```

3. **Create File Server Application**
```bash
# Create project directory
mkdir /opt/hellow-file-server
cd /opt/hellow-file-server

# Initialize project
npm init -y
npm install express multer sharp uuid cors helmet express-rate-limit jsonwebtoken bcrypt dotenv
```

4. **File Server Code**
```javascript
// /opt/hellow-file-server/server.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const uploadLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 uploads per windowMs
  message: 'Too many uploads, please try again later.'
});

// File storage configuration
const UPLOAD_DIR = '/opt/hellow-storage/uploads';
const THUMBNAILS_DIR = '/opt/hellow-storage/thumbnails';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
}

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav',
      'application/pdf', 'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Upload endpoint
app.post('/api/upload', uploadLimit, authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const filePath = req.file.path;
    const publicUrl = `${req.protocol}://${req.get('host')}/api/files/${fileId}`;
    const downloadUrl = `${req.protocol}://${req.get('host')}/api/download/${fileId}`;

    let thumbnailUrl = null;

    // Generate thumbnail for images
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${fileId}.webp`);
        
        await sharp(filePath)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);

        thumbnailUrl = `${req.protocol}://${req.get('host')}/api/thumbnails/${fileId}`;
      } catch (thumbError) {
        console.error('Thumbnail generation failed:', thumbError);
      }
    }

    // Store file metadata
    const fileMetadata = {
      id: fileId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.username,
      uploadedAt: new Date().toISOString(),
      path: filePath
    };

    // Save metadata to JSON file (in production, use a database)
    const metadataPath = path.join(UPLOAD_DIR, `${fileId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(fileMetadata, null, 2));

    res.json({
      success: true,
      fileId,
      publicUrl,
      downloadUrl,
      thumbnailUrl,
      internalPath: filePath,
      size: req.file.size,
      type: req.file.mimetype
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve files
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const metadataPath = path.join(UPLOAD_DIR, `${fileId}.json`);
    
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);

    res.setHeader('Content-Type', metadata.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
    
    res.sendFile(metadata.path);

  } catch (error) {
    console.error('File serve error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Serve thumbnails
app.get('/api/thumbnails/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${fileId}.webp`);
    
    res.setHeader('Content-Type', 'image/webp');
    res.sendFile(thumbnailPath);

  } catch (error) {
    res.status(404).json({ error: 'Thumbnail not found' });
  }
});

// Download endpoint
app.get('/api/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const metadataPath = path.join(UPLOAD_DIR, `${fileId}.json`);
    
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    
    res.sendFile(metadata.path);

  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
ensureDirectories().then(() => {
  app.listen(PORT, () => {
    console.log(`File server running on port ${PORT}`);
  });
});
```

5. **Environment Configuration**
```bash
# Create .env file
cat > /opt/hellow-file-server/.env << EOF
JWT_SECRET=your-jwt-secret-here
PORT=3001
NODE_ENV=production
EOF
```

6. **Nginx Configuration**
```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/hellow-files

# Add this configuration:
server {
    listen 80;
    server_name files.hellow.local; # Replace with your domain

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/hellow-files /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

7. **Start with PM2**
```bash
cd /opt/hellow-file-server
pm2 start server.js --name "hellow-files"
pm2 save
pm2 startup
```

## 🎨 VM 2: Image Processing Server

### System Requirements
- **OS**: Ubuntu 22.04 LTS
- **RAM**: 8GB minimum (for image processing)
- **Storage**: 100GB
- **CPU**: 4 cores minimum

### Installation Steps

1. **Follow VM1 steps 1-3 for basic setup**

2. **Install Additional Dependencies**
```bash
# Install ImageMagick and FFmpeg
sudo apt install -y imagemagick ffmpeg

# Install Python for advanced processing
sudo apt install -y python3 python3-pip
pip3 install Pillow opencv-python
```

3. **Image Processing Server Code**
```javascript
// /opt/hellow-image-processor/server.js
const express = require('express');
const sharp = require('sharp');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Process image endpoint
app.post('/api/process/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { resize, thumbnail, compress } = req.body;

    // Get original file from file server
    const originalUrl = `http://files.hellow.local/api/files/${fileId}`;
    
    // Process and return new URLs
    const processedImages = {};

    if (resize) {
      // Resize image
      const resizedId = uuidv4();
      // Processing logic here
      processedImages.resized = `http://images.hellow.local/api/processed/${resizedId}`;
    }

    if (thumbnail) {
      // Generate thumbnail
      const thumbId = uuidv4();
      // Processing logic here
      processedImages.thumbnail = `http://images.hellow.local/api/processed/${thumbId}`;
    }

    res.json({
      success: true,
      original: originalUrl,
      processed: processedImages
    });

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Image processor running on port ${PORT}`);
});
```

## 🔧 Environment Variables for Vercel

Add these to your Vercel environment variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Proxmox servers
NEXT_PUBLIC_PROXMOX_FILE_SERVER=https://files.hellow.local
NEXT_PUBLIC_PROXMOX_IMAGE_PROCESSOR=https://images.hellow.local

# Existing
JWT_SECRET=your-jwt-secret
KV_REST_API_URL=your-kv-url
KV_REST_API_TOKEN=your-kv-token
```

## 🔒 Security Considerations

1. **Firewall Setup**
```bash
# Only allow specific ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

2. **SSL Certificates**
```bash
# Get free SSL with Let's Encrypt
sudo certbot --nginx -d files.hellow.local
sudo certbot --nginx -d images.hellow.local
```

3. **Backup Strategy**
```bash
# Set up automated backups
# Use Proxmox backup features
# Sync to cloud storage
```

## 📊 Monitoring

```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# Monitor with PM2
pm2 monit

# Check logs
pm2 logs hellow-files
```

## 🚀 Benefits of This Architecture

1. **Complete Control**: Your files stay on your infrastructure
2. **Scalability**: Add more VMs as needed
3. **Cost Effective**: No per-GB cloud storage fees
4. **Performance**: Local processing is often faster
5. **Privacy**: Files never leave your network
6. **Customization**: Build any file processing features you want

## 🔄 Integration Flow

```
User uploads file → Vercel API → Proxmox Storage → 
Supabase notification → Real-time delivery → All users see file
```

This setup gives you enterprise-grade real-time messaging with complete control over your file storage and processing!
