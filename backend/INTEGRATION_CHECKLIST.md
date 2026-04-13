# Integration Checklist ✅

Use this checklist to verify that the frontend-backend integration is working correctly.

## Pre-Integration Setup

### Backend Setup
- [ ] Python 3.11+ installed
- [ ] Virtual environment created (`python -m venv venv`)
- [ ] Virtual environment activated
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] `.env` file created from `.env.example`
- [ ] `GROQ_API_KEY` added to `.env`
- [ ] Backend starts without errors (`python main.py`)
- [ ] Backend accessible at http://localhost:8000

### Frontend Setup
- [ ] Node.js 18+ installed
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created (optional)
- [ ] `VITE_API_BASE_URL` configured (if using .env)
- [ ] Frontend starts without errors (`npm run dev`)
- [ ] Frontend accessible at http://localhost:5173

## Backend Verification

### API Endpoints
- [ ] Health check works: `GET http://localhost:8000/api/health`
- [ ] Swagger docs accessible: http://localhost:8000/docs
- [ ] ReDoc accessible: http://localhost:8000/redoc
- [ ] CORS headers present in responses
- [ ] No errors in backend terminal

### Chat Endpoint
- [ ] POST `/api/chat` accepts requests
- [ ] Returns valid JSON response
- [ ] Includes `response`, `conversation_id`, `sources` fields
- [ ] Handles missing `conversation_id`
- [ ] Returns error message if GROQ_API_KEY not set

### GPA Endpoint
- [ ] POST `/api/gpa/calculate` accepts requests
- [ ] Returns valid JSON response
- [ ] Includes `gpa`, `total_credits`, `total_points` fields
- [ ] Validates course data (name, credits, grade)
- [ ] Returns appropriate error for invalid grades

## Frontend Verification

### Service Layer
- [ ] `src/config/api.js` exists
- [ ] API endpoints correctly configured
- [ ] `src/services/chatService.js` exists
- [ ] `src/services/gpaService.js` exists
- [ ] No import errors in browser console

### Chatbot Component
- [ ] Chatbot button visible (bottom right)
- [ ] Chatbot opens when clicked
- [ ] All tabs visible (Home, Chat, GPA, Map)
- [ ] No console errors on load

### Chat Tab
- [ ] Chat interface loads
- [ ] Can type messages
- [ ] Send button works
- [ ] Messages appear in chat
- [ ] Bot responses received from backend
- [ ] Loading indicator shows during API call
- [ ] Error message shown if backend unavailable
- [ ] Voice input button present (optional feature)

### GPA Tab
- [ ] GPA home page shows two options
- [ ] Can navigate to Term GPA calculator
- [ ] Can navigate to Accumulative GPA calculator
- [ ] Can add/remove subjects
- [ ] Subject dropdown works
- [ ] Grade inputs accept numbers
- [ ] Calculate button works
- [ ] GPA result displays after calculation
- [ ] Loading state shows during calculation
- [ ] Error handling works if backend fails

### Map Tab
- [ ] Map loads correctly
- [ ] Search bar visible
- [ ] Can search for locations
- [ ] Autocomplete suggestions appear
- [ ] User location marker shows (if permission granted)
- [ ] Can select destination
- [ ] Route displays between points
- [ ] Route info shows (distance, time)

## Integration Testing

### Manual Tests
- [ ] Open test-integration.html in browser
- [ ] Health check test passes
- [ ] Chat test sends message successfully
- [ ] GPA test calculates correctly
- [ ] All tests show green success messages

### End-to-End Tests
- [ ] Open frontend at http://localhost:5173
- [ ] Click chatbot button
- [ ] Send a chat message
- [ ] Receive response from backend
- [ ] Navigate to GPA tab
- [ ] Add a course with grades
- [ ] Click Calculate
- [ ] See GPA result from backend
- [ ] Navigate to Map tab
- [ ] Search for a location
- [ ] See map update

### Error Handling
- [ ] Stop backend server
- [ ] Try sending chat message
- [ ] Error message displays in UI
- [ ] Try calculating GPA
- [ ] Error message displays in UI
- [ ] Restart backend
- [ ] Features work again

## Network Verification

### Browser DevTools
- [ ] Open browser DevTools (F12)
- [ ] Go to Network tab
- [ ] Send chat message
- [ ] See POST request to `/api/chat`
- [ ] Response status is 200
- [ ] Response contains expected data
- [ ] Calculate GPA
- [ ] See POST request to `/api/gpa/calculate`
- [ ] Response status is 200
- [ ] Response contains GPA data

### CORS
- [ ] No CORS errors in console
- [ ] Requests include proper headers
- [ ] Responses include CORS headers
- [ ] Preflight requests succeed (if any)

## Performance

### Backend
- [ ] Health check responds quickly (<100ms)
- [ ] Chat responses arrive in reasonable time (<5s)
- [ ] GPA calculations are instant (<100ms)
- [ ] No memory leaks during extended use

### Frontend
- [ ] UI is responsive
- [ ] No lag when typing
- [ ] Smooth animations
- [ ] No console warnings
- [ ] No memory leaks

## Documentation

- [ ] README.md updated with integration info
- [ ] INTEGRATION_GUIDE.md created
- [ ] QUICK_REFERENCE.md created
- [ ] API endpoints documented
- [ ] Environment variables documented
- [ ] Troubleshooting section included

## Production Readiness (Optional)

### Security
- [ ] CORS origins restricted (not "*")
- [ ] API keys not exposed in frontend
- [ ] Environment variables used for sensitive data
- [ ] Input validation on backend
- [ ] Error messages don't expose sensitive info

### Deployment
- [ ] Frontend builds successfully (`npm run build`)
- [ ] Backend runs with production ASGI server
- [ ] Environment variables configured for production
- [ ] API base URL updated for production
- [ ] HTTPS configured (if applicable)

## Common Issues Checklist

If something doesn't work, check:

- [ ] Both servers are running
- [ ] Correct ports (8000 for backend, 5173 for frontend)
- [ ] No firewall blocking connections
- [ ] GROQ_API_KEY is valid
- [ ] No typos in environment variables
- [ ] Dependencies are installed
- [ ] Browser cache cleared
- [ ] Console shows no errors

## Sign-Off

- [ ] All critical features tested
- [ ] No blocking issues found
- [ ] Documentation complete
- [ ] Ready for development/testing

---

**Date Completed:** _______________

**Tested By:** _______________

**Notes:**
_______________________________________________
_______________________________________________
_______________________________________________
