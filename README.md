# Vision Test Application - Quick Start

## 🚀 Quick Start

### Option 1: Using the PowerShell Script (Easiest)

Run the start script that will launch both servers:

```powershell
cd e:\visuar\Visuar
.\start-servers.ps1
```

This will open two terminal windows:

- Backend (FastAPI) on http://localhost:8000
- Frontend (React) on http://localhost:5173

### Option 2: Manual Start

#### Terminal 1 - Backend

```powershell
cd e:\visuar\Visuar\supabase
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

#### Terminal 2 - Frontend

```powershell
cd e:\visuar\Visuar\vision-test-react
npm run dev
```

## 📱 Access the Application

Once both servers are running, open your browser and go to:
**http://localhost:5173**

## 🧪 Test the Integration

1. **Sign Up**: Create a new account

   - Navigate to Sign Up page
   - Enter your details
   - Check email for verification (if Supabase email confirmation is enabled)

2. **Login**: Sign in with your credentials

   - Enter email and password
   - You'll be redirected to the dashboard

3. **Create Profile**: Add your health information

   - Click "View Profile" from dashboard
   - Fill in the health profile form
   - Click "Save Changes"
   - Data is stored in Supabase database

4. **Protected Routes**: Try accessing protected pages
   - Dashboard, Profile, Settings require authentication
   - Logged out users are redirected to login

## 🔧 What Was Integrated

### ✅ Authentication System

- Sign up with email/password
- Login with Supabase Auth
- JWT token management
- Automatic token refresh
- Protected routes

### ✅ API Integration

- Axios HTTP client
- Automatic token injection
- Error handling
- Request/response interceptors

### ✅ Profile Management

- Create/update health profile
- Fetch profile data from backend
- Store in PostgreSQL via Supabase

### ✅ User Interface

- Login page with real auth
- Sign up page with validation
- Profile page with backend sync
- Dashboard with logout functionality
- Protected route wrapper

## 📁 Key Files Created

```
vision-test-react/
├── .env                              # Environment config
├── src/
│   ├── lib/
│   │   ├── supabase.js              # Supabase client
│   │   └── api.js                   # API service layer
│   ├── context/
│   │   └── AuthContext.jsx          # Auth state management
│   └── components/
│       └── ProtectedRoute.jsx       # Route protection
```

## 🛠️ Tech Stack

**Backend:**

- FastAPI
- Supabase (Auth + Database)
- SQLAlchemy
- PostgreSQL

**Frontend:**

- React 18
- Vite
- React Router
- Supabase JS Client
- Axios
- Tailwind CSS

## 📚 Documentation

For detailed integration documentation, see [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

## ❗ Troubleshooting

### Backend doesn't start

- Check if Python virtual environment exists
- Run: `pip install -r requirements.txt`
- Verify `.env` file has Supabase credentials

### Frontend doesn't start

- Run: `npm install` in vision-test-react folder
- Check if Node.js is installed
- Clear npm cache: `npm cache clean --force`

### Can't login

- Verify Supabase credentials match in both .env files
- Check browser console for errors
- Ensure backend is running on port 8000

### API requests fail

- Check CORS in backend (should allow all origins)
- Verify `VITE_API_URL` in frontend .env
- Check backend logs for errors

## 🎯 Next Steps

- Add test results storage
- Implement test selection backend
- Add analytics dashboard
- Set up real-time features
- Deploy to production
