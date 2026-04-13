filepath = r'c:\React Course - (Udmey)\PORTAL-STUDENT-BNU\backend\routers\academic_core.py'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

target = """    engine = AcademicRegulationsEngine(db)
    result = engine.evaluate_student_eligibility(student_user_id)
    
    return result
    GradingScaleCreate,
    GradingScaleResponse,"""

if target in text:
    new_text = text.replace(target, """    engine = AcademicRegulationsEngine(db)
    result = engine.evaluate_student_eligibility(student_user_id)
    
    return result

@router.get("/notifications/my")
async def get_my_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = db.query(SystemNotification).filter(
        SystemNotification.user_id == current_user.id,
        SystemNotification.is_read == False
    ).order_by(SystemNotification.created_at.desc()).all()
    
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "created_at": n.created_at.isoformat()
        } for n in notifs
    ]

@router.patch("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = db.query(SystemNotification).filter(
        SystemNotification.id == notif_id,
        SystemNotification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "success"}""")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_text)
    print("Patched.")
else:
    print("Not found.")
