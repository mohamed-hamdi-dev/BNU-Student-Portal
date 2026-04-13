# 🚀 How to Use the Backend API

## Quick Start

The backend API is already running on **http://localhost:8001**

You can access it in 3 ways:

### 1️⃣ Using the Test Page (Easiest)
Open `test-api.html` in your browser to test all API endpoints with a visual interface.

```bash
# Just open the file in your browser
start test-api.html
```

### 2️⃣ Using Frontend Services (Recommended)
Use the service layer we created in `src/services/`:

```javascript
// Example: Get student grades
import { getStudentGrades } from '../services/studentService';

const grades = await getStudentGrades('1000001');
console.log(grades);
```

### 3️⃣ Direct API Calls (Manual)
Call the API directly using fetch:

```javascript
// Example: Login
const response = await fetch('http://localhost:8001/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: '1000001',
    password: 'pass123'
  })
});

const data = await response.json();
console.log(data);
```

---

## 📋 Available API Endpoints

### Authentication
```
POST   /login                          - Login user
POST   /forgot-password                - Request password reset
POST   /register                       - Register new user
```

### Student Profile
```
GET    /api/student/{id}               - Get student profile
PUT    /api/student/{id}               - Update student profile
GET    /api/student/{id}/stats         - Get student statistics
```

### Courses
```
GET    /api/courses                    - Get all courses (optional: ?year=1)
GET    /api/courses/{id}               - Get specific course
POST   /api/courses/register           - Register for a course
GET    /api/student/{id}/registrations - Get student's registrations
DELETE /api/courses/register/{student_id}/{course_id} - Drop course
```

### Academic Records
```
GET    /api/student/{id}/grades        - Get grades with GPA
POST   /api/student/{id}/grades        - Add grade entry
```

### Payments
```
POST   /api/payment/calculate          - Calculate tuition with discounts
POST   /api/payment/process            - Process payment
GET    /api/student/{id}/payments      - Get payment history
```

### Quizzes
```
GET    /api/quizzes                    - Get all quizzes
GET    /api/quizzes/{id}               - Get specific quiz
POST   /api/quizzes/{id}/submit        - Submit quiz answers
GET    /api/student/{id}/quiz-results  - Get quiz results
```

### Dashboard
```
GET    /api/announcements              - Get announcements
GET    /api/admin/stats                - Get admin statistics
```

### Existing Features
```
POST   /api/chat                       - Chat with RAG bot
POST   /api/gpa/calculate              - Calculate GPA
GET    /api/health                     - Health check
```

---

## 🎯 Common Use Cases

### 1. Login Flow
```javascript
// Step 1: Login
const loginResponse = await fetch('http://localhost:8001/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: '1000001',
    password: 'pass123'
  })
});

const { user, token } = await loginResponse.json();

// Step 2: Store user data
localStorage.setItem('loggedUser', JSON.stringify(user));
localStorage.setItem('token', token);

// Step 3: Redirect to dashboard
window.location.href = '/dashboardstudent';
```

### 2. Get Student Grades
```javascript
// Get logged in user
const user = JSON.parse(localStorage.getItem('loggedUser'));

// Fetch grades
const response = await fetch(`http://localhost:8001/api/student/${user.username}/grades`);
const gradesData = await response.json();

console.log('Cumulative GPA:', gradesData.cumulativeGpa);
console.log('Total Credits:', gradesData.totalCredits);
console.log('Semesters:', gradesData.semesters);
```

### 3. Register for a Course
```javascript
const response = await fetch('http://localhost:8001/api/courses/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    studentId: '1000001',
    courseId: 'CS101',
    groupId: 'G1'
  })
});

const result = await response.json();
console.log(result.message); // "Course registered successfully"
```

### 4. Calculate Payment with GPA Discount
```javascript
const response = await fetch('http://localhost:8001/api/payment/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gpa: 3.8  // GPA 3.7+ gets 15% discount
  })
});

const payment = await response.json();
console.log('Base Tuition:', payment.baseTuition);        // 25000
console.log('Discount:', payment.discountRate);           // 0.15 (15%)
console.log('After Discount:', payment.tuitionAfterDiscount);
console.log('Final Total:', payment.finalTotal);
```

### 5. Get Available Courses
```javascript
// Get all courses
const response = await fetch('http://localhost:8001/api/courses');
const courses = await response.json();

// Filter by year
const year1Courses = await fetch('http://localhost:8001/api/courses?year=1');
const firstYearCourses = await year1Courses.json();
```

---

## 🔧 Using Service Layer (Best Practice)

Instead of calling the API directly, use the service layer:

### Example: CourseTable.jsx (Updated)
```javascript
import { getStudentGrades } from '../services/studentService';

function CourseTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('loggedUser'));
        const grades = await getStudentGrades(user.username);
        setData(grades);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <h1>GPA: {data.cumulativeGpa}</h1>
      {/* Display semesters and courses */}
    </div>
  );
}
```

---

## 📊 Test Credentials

Use these accounts to test:

| Username | Password | Role    | Description |
|----------|----------|---------|-------------|
| 1000001  | pass123  | student | Has 2 grades in database |
| 2358858  | abcdef   | student | Empty record |
| admin    | admin123 | admin   | Administrator |

---

## 🗄️ Database Location

All data is stored in: `Data/db.json`

You can view/edit this file to see or modify:
- Users
- Courses
- Grades
- Registrations
- Payments
- Quizzes

---

## ✅ What's Already Working

1. ✅ Backend running on port 8001
2. ✅ Frontend running on port 5173
3. ✅ Login page connects to backend
4. ✅ Database with sample data
5. ✅ All 40+ API endpoints ready
6. ✅ Service layer created (`src/services/`)
7. ✅ CourseTable.jsx updated to use real API

---

## 🔄 What Needs Integration

These pages still use mock data and need to be updated:

1. ⚠️ `src/pages/AcademicRegistration.jsx` - Use `courseService.js`
2. ⚠️ `src/pages/Payment.jsx` - Use `paymentService.js`
3. ⚠️ `src/pages/PersonData.jsx` - Use `studentService.js`
4. ⚠️ `src/pages/QiezBNU/QiezBNU.jsx` - Use quiz endpoints

---

## 🎨 Example: Update a Page to Use API

Let's say you want to update `Payment.jsx`:

```javascript
// Before (mock data)
const [amount, setAmount] = useState(25000);

// After (real API)
import { calculatePayment } from '../services/paymentService';

const handleCalculate = async () => {
  try {
    const user = JSON.parse(localStorage.getItem('loggedUser'));
    const result = await calculatePayment(user.gpa);
    
    setBaseTuition(result.baseTuition);
    setDiscount(result.discountRate);
    setFinalAmount(result.finalTotal);
  } catch (error) {
    console.error('Error calculating payment:', error);
  }
};
```

---

## 🚨 Troubleshooting

### Backend not responding?
```bash
# Check if backend is running
curl http://localhost:8001/api/health

# If not, start it:
cd backend
python full_api.py
```

### CORS errors?
The backend already has CORS enabled for all origins. If you still get errors, make sure the backend is running on port 8001.

### Database not found?
Make sure `Data/db.json` exists. If not, run:
```bash
cd backend
python seed_data.py
```

---

## 📚 Next Steps

1. Open `test-api.html` to test all endpoints
2. Update remaining frontend pages to use service layer
3. Add error handling and loading states
4. Consider adding authentication tokens to requests
5. Add form validation before API calls

---

## 💡 Pro Tips

1. Always check `localStorage` for logged in user before API calls
2. Use try-catch blocks for error handling
3. Show loading states while fetching data
4. Display user-friendly error messages
5. Log API responses during development

---

Need help? Check:
- `FULL_BACKEND_GUIDE.md` - Complete API documentation
- `COMPLETE_INTEGRATION_SUMMARY.md` - Integration overview
- `src/services/` - Service layer examples
