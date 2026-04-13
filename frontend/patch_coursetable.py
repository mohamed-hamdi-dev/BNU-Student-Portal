import re

filepath = r'c:\React Course - (Udmey)\PORTAL-STUDENT-BNU\frontend\src\pages\CourseTable.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add import
if 'getMyStudentProfile' not in text:
    text = text.replace('import { listMyAdvisorRequests } from "../services/advisorRegistrationApi";',
                        'import { listMyAdvisorRequests, getMyStudentProfile } from "../services/advisorRegistrationApi";')

# 2. Add state
if 'const [profileStats, setProfileStats] = useState' not in text:
    target_state = '    const [approvedTermsFromRequests, setApprovedTermsFromRequests] = useState(() => new Set());'
    new_state = target_state + '\n    const [profileStats, setProfileStats] = useState({ gpa: 0, hours: 0 });'
    text = text.replace(target_state, new_state)

# 3. Add fetch
fetch_target = '''        const loadRequestTerms = async () => {
            try {
                const res = await listMyAdvisorRequests();'''
fetch_new = '''        const loadRequestTerms = async () => {
            try {
                getMyStudentProfile().then(p => {
                    if (p) setProfileStats({ gpa: Number(p.gpa || 0), hours: Number(p.passed_hours || 0) });
                }).catch(() => {});
                
                const res = await listMyAdvisorRequests();'''
text = text.replace(fetch_target, fetch_new)

# 4. Replace calculations
calc_target = '''    const totalCredits = useMemo(
        () => grouped.reduce((acc, group) => acc + group.records.reduce((sum, row) => sum + (parseFloat(row.credits) || 0), 0), 0),
        [grouped]
    );

    const cumulativeGpa = useMemo(() => {
        const flat = grouped.flatMap((group) => group.records);
        return calculateSemesterGpa(flat);
    }, [grouped]);'''
calc_new = '''    const totalCredits = profileStats.hours > 0 ? profileStats.hours : useMemo(
        () => grouped.reduce((acc, group) => acc + group.records.reduce((sum, row) => sum + (parseFloat(row.credits) || 0), 0), 0),
        [grouped, profileStats]
    );

    const cumulativeGpa = profileStats.gpa > 0 ? profileStats.gpa : useMemo(() => {
        const flat = grouped.flatMap((group) => group.records);
        return calculateSemesterGpa(flat);
    }, [grouped, profileStats]);'''
text = text.replace(calc_target, calc_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("CourseTable.jsx patched successfully")
