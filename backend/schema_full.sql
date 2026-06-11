-- Full schema export (public) generated via SQLAlchemy reflection
SET search_path = public, pg_catalog;


CREATE TABLE public.ac_assessment_template_components (
	id SERIAL NOT NULL, 
	template_id INTEGER NOT NULL, 
	key VARCHAR(50) NOT NULL, 
	label_ar VARCHAR(255) NOT NULL, 
	label_en VARCHAR(255), 
	max_marks DOUBLE PRECISION NOT NULL, 
	weight DOUBLE PRECISION, 
	min_pass DOUBLE PRECISION, 
	is_required BOOLEAN NOT NULL, 
	display_order INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_assessment_template_components_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_assessment_template_components_template_id_fkey FOREIGN KEY(template_id) REFERENCES public.ac_assessment_templates (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_assessment_templates (
	id SERIAL NOT NULL, 
	code VARCHAR(100) NOT NULL, 
	name_ar VARCHAR(255) NOT NULL, 
	name_en VARCHAR(255), 
	college_id INTEGER, 
	track_id INTEGER, 
	study_year INTEGER, 
	semester VARCHAR(20), 
	effective_from_year VARCHAR(30), 
	is_default BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_assessment_templates_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_assessment_templates_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT ac_assessment_templates_track_id_fkey FOREIGN KEY(track_id) REFERENCES public.ac_college_tracks (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_audit_logs (
	id SERIAL NOT NULL, 
	actor_user_id INTEGER, 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(100) NOT NULL, 
	action VARCHAR(100) NOT NULL, 
	before_json TEXT, 
	after_json TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_audit_logs_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_audit_logs_actor_user_id_fkey FOREIGN KEY(actor_user_id) REFERENCES public.users (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_bank_account_settings (
	id SERIAL NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	college_id INTEGER, 
	bank_name VARCHAR(120) NOT NULL, 
	account_holder_name VARCHAR(200) NOT NULL, 
	account_number VARCHAR(120) NOT NULL, 
	iban VARCHAR(120), 
	swift_code VARCHAR(50), 
	branch_name VARCHAR(120), 
	payment_note TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_bank_account_settings_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_bank_account_settings_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT uq_bank_account_scope UNIQUE NULLS DISTINCT (academic_year_label, semester, college_id)
);


CREATE TABLE public.ac_bank_receipts (
	id SERIAL NOT NULL, 
	payment_transaction_id INTEGER NOT NULL, 
	receipt_no VARCHAR(120), 
	bank_name VARCHAR(120) NOT NULL, 
	deposit_date TIMESTAMP WITH TIME ZONE, 
	uploaded_file_url VARCHAR(500), 
	ocr_data_json TEXT, 
	review_status VARCHAR(20) NOT NULL, 
	reviewed_by_user_id INTEGER, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	review_note TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_bank_receipts_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_bank_receipts_payment_transaction_id_fkey FOREIGN KEY(payment_transaction_id) REFERENCES public.ac_payment_transactions (id) ON DELETE CASCADE, 
	CONSTRAINT ac_bank_receipts_reviewed_by_user_id_fkey FOREIGN KEY(reviewed_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_college_credit_policy_tiers (
	id SERIAL NOT NULL, 
	college_id INTEGER NOT NULL, 
	min_gpa DOUBLE PRECISION NOT NULL, 
	max_gpa DOUBLE PRECISION, 
	min_credits INTEGER NOT NULL, 
	max_credits INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_college_credit_policy_tiers_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_college_credit_policy_tiers_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_college_tracks (
	id SERIAL NOT NULL, 
	college_id INTEGER NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name_ar VARCHAR(255) NOT NULL, 
	name_en VARCHAR(255), 
	starts_at_year INTEGER, 
	capacity INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_college_tracks_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_college_tracks_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_colleges (
	id SERIAL NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name_ar VARCHAR(255) NOT NULL, 
	name_en VARCHAR(255), 
	total_years INTEGER NOT NULL, 
	branching_start_year INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_colleges_pkey PRIMARY KEY (id)
);


CREATE TABLE public.ac_course_catalog (
	id SERIAL NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	title_ar VARCHAR(255) NOT NULL, 
	title_en VARCHAR(255), 
	college_id INTEGER, 
	track_id INTEGER, 
	plan_id INTEGER, 
	study_year INTEGER, 
	semester VARCHAR(20), 
	credit_hours DOUBLE PRECISION NOT NULL, 
	lecture_hours DOUBLE PRECISION NOT NULL, 
	lab_hours DOUBLE PRECISION NOT NULL, 
	max_mid1 DOUBLE PRECISION NOT NULL, 
	max_mid2 DOUBLE PRECISION NOT NULL, 
	max_coursework DOUBLE PRECISION NOT NULL, 
	max_final DOUBLE PRECISION NOT NULL, 
	max_total DOUBLE PRECISION NOT NULL, 
	assessment_template_id INTEGER, 
	allow_assessment_override BOOLEAN NOT NULL, 
	assessment_override_components_json TEXT NOT NULL, 
	pass_mark DOUBLE PRECISION, 
	grading_scale_id INTEGER, 
	is_shared BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_course_catalog_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_course_catalog_assessment_template_id_fkey FOREIGN KEY(assessment_template_id) REFERENCES public.ac_assessment_templates (id) ON DELETE SET NULL, 
	CONSTRAINT ac_course_catalog_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT ac_course_catalog_grading_scale_id_fkey FOREIGN KEY(grading_scale_id) REFERENCES public.ac_grading_scales (id) ON DELETE SET NULL, 
	CONSTRAINT ac_course_catalog_plan_id_fkey FOREIGN KEY(plan_id) REFERENCES public.ac_curriculum_plans (id) ON DELETE SET NULL, 
	CONSTRAINT ac_course_catalog_track_id_fkey FOREIGN KEY(track_id) REFERENCES public.ac_college_tracks (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_course_offerings (
	id SERIAL NOT NULL, 
	course_id INTEGER NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	section VARCHAR(50) NOT NULL, 
	target_group_id VARCHAR(100), 
	target_group_name VARCHAR(255), 
	day_of_week VARCHAR(20), 
	start_time VARCHAR(5), 
	end_time VARCHAR(5), 
	room_name VARCHAR(100), 
	instructor_user_id INTEGER, 
	max_students INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_course_offerings_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_course_offerings_course_id_fkey FOREIGN KEY(course_id) REFERENCES public.ac_course_catalog (id) ON DELETE CASCADE, 
	CONSTRAINT ac_course_offerings_instructor_user_id_fkey FOREIGN KEY(instructor_user_id) REFERENCES public.users (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_course_prerequisites (
	id SERIAL NOT NULL, 
	course_id INTEGER NOT NULL, 
	prerequisite_course_id INTEGER NOT NULL, 
	condition_type VARCHAR(50) NOT NULL, 
	min_grade VARCHAR(5), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_course_prerequisites_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_course_prerequisites_course_id_fkey FOREIGN KEY(course_id) REFERENCES public.ac_course_catalog (id) ON DELETE CASCADE, 
	CONSTRAINT ac_course_prerequisites_prerequisite_course_id_fkey FOREIGN KEY(prerequisite_course_id) REFERENCES public.ac_course_catalog (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_curriculum_plans (
	id SERIAL NOT NULL, 
	college_id INTEGER NOT NULL, 
	batch_year INTEGER NOT NULL, 
	version INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_curriculum_plans_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_curriculum_plans_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_gpa_discount_policies (
	id SERIAL NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	college_id INTEGER, 
	min_gpa DOUBLE PRECISION NOT NULL, 
	max_gpa DOUBLE PRECISION, 
	discount_type VARCHAR(20) NOT NULL, 
	discount_value DOUBLE PRECISION NOT NULL, 
	priority INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_gpa_discount_policies_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_gpa_discount_policies_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_grade_import_batches (
	id SERIAL NOT NULL, 
	offering_id INTEGER NOT NULL, 
	import_cycle VARCHAR(20) NOT NULL, 
	source_file_name VARCHAR(255), 
	valid_count INTEGER NOT NULL, 
	error_count INTEGER NOT NULL, 
	errors_json TEXT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_by_user_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_grade_import_batches_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_grade_import_batches_created_by_user_id_fkey FOREIGN KEY(created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_grade_import_batches_offering_id_fkey FOREIGN KEY(offering_id) REFERENCES public.ac_course_offerings (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_gradebook (
	id SERIAL NOT NULL, 
	selection_id INTEGER NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	offering_id INTEGER NOT NULL, 
	mid1 DOUBLE PRECISION, 
	mid2 DOUBLE PRECISION, 
	coursework DOUBLE PRECISION, 
	final DOUBLE PRECISION, 
	component_scores_json TEXT NOT NULL, 
	total DOUBLE PRECISION, 
	grade VARCHAR(20), 
	import_cycle VARCHAR(20), 
	publish_status VARCHAR(20) NOT NULL, 
	last_updated_by_user_id INTEGER, 
	published_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_gradebook_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_gradebook_last_updated_by_user_id_fkey FOREIGN KEY(last_updated_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_gradebook_offering_id_fkey FOREIGN KEY(offering_id) REFERENCES public.ac_course_offerings (id) ON DELETE CASCADE, 
	CONSTRAINT ac_gradebook_selection_id_fkey FOREIGN KEY(selection_id) REFERENCES public.ac_registration_selections (id) ON DELETE CASCADE, 
	CONSTRAINT ac_gradebook_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_grading_scale_items (
	id SERIAL NOT NULL, 
	scale_id INTEGER NOT NULL, 
	grade_code VARCHAR(20) NOT NULL, 
	label_ar VARCHAR(255), 
	label_en VARCHAR(255), 
	min_percentage DOUBLE PRECISION NOT NULL, 
	max_percentage DOUBLE PRECISION, 
	gpa_points DOUBLE PRECISION, 
	is_passing BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_grading_scale_items_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_grading_scale_items_scale_id_fkey FOREIGN KEY(scale_id) REFERENCES public.ac_grading_scales (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_grading_scales (
	id SERIAL NOT NULL, 
	code VARCHAR(100) NOT NULL, 
	name_ar VARCHAR(255) NOT NULL, 
	name_en VARCHAR(255), 
	college_id INTEGER, 
	is_default BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_grading_scales_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_grading_scales_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_late_penalty_rules (
	id SERIAL NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	college_id INTEGER, 
	grace_period_days INTEGER NOT NULL, 
	penalty_type VARCHAR(20) NOT NULL, 
	penalty_value DOUBLE PRECISION NOT NULL, 
	repeats_weekly BOOLEAN NOT NULL, 
	max_penalty_amount DOUBLE PRECISION, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_late_penalty_rules_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_late_penalty_rules_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT uq_late_penalty_scope UNIQUE NULLS DISTINCT (academic_year_label, semester, college_id)
);


CREATE TABLE public.ac_notifications (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	message TEXT NOT NULL, 
	type VARCHAR(50), 
	is_read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_notifications_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_notifications_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_payment_configs (
	id SERIAL NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	college_id INTEGER, 
	batch_year INTEGER, 
	pricing_mode VARCHAR(20) NOT NULL, 
	split_main_terms BOOLEAN NOT NULL, 
	credit_hour_rate DOUBLE PRECISION, 
	base_amount DOUBLE PRECISION NOT NULL, 
	currency VARCHAR(10) NOT NULL, 
	allow_online BOOLEAN NOT NULL, 
	allow_fawry BOOLEAN NOT NULL, 
	allow_bank_transfer BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_payment_configs_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_payment_configs_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT uq_payment_config_scope UNIQUE NULLS DISTINCT (academic_year_label, semester, college_id)
);


CREATE TABLE public.ac_payment_fee_items (
	id SERIAL NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	college_id INTEGER, 
	name_ar VARCHAR(200) NOT NULL, 
	name_en VARCHAR(200), 
	item_code VARCHAR(80), 
	amount_type VARCHAR(20) NOT NULL, 
	amount_value DOUBLE PRECISION NOT NULL, 
	base_scope VARCHAR(30) NOT NULL, 
	is_mandatory BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_payment_fee_items_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_payment_fee_items_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_payment_orders (
	id SERIAL NOT NULL, 
	order_no VARCHAR(80) NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	college_id INTEGER, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	amount_before_discount DOUBLE PRECISION NOT NULL, 
	discount_amount DOUBLE PRECISION NOT NULL, 
	additional_fees_amount DOUBLE PRECISION NOT NULL, 
	late_penalty_amount DOUBLE PRECISION NOT NULL, 
	amount_due DOUBLE PRECISION NOT NULL, 
	due_date TIMESTAMP WITH TIME ZONE, 
	breakdown_json TEXT, 
	currency VARCHAR(10) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	registration_unlock_status VARCHAR(20) NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	paid_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_payment_orders_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_payment_orders_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT ac_payment_orders_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE, 
	CONSTRAINT uq_payment_order_term UNIQUE NULLS DISTINCT (student_user_id, academic_year_label, semester)
);


CREATE TABLE public.ac_payment_transactions (
	id SERIAL NOT NULL, 
	payment_order_id INTEGER NOT NULL, 
	method VARCHAR(20) NOT NULL, 
	provider VARCHAR(50), 
	provider_ref VARCHAR(120), 
	idempotency_key VARCHAR(120), 
	requested_amount DOUBLE PRECISION NOT NULL, 
	confirmed_amount DOUBLE PRECISION, 
	status VARCHAR(30) NOT NULL, 
	raw_request_json TEXT, 
	raw_response_json TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_payment_transactions_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_payment_transactions_payment_order_id_fkey FOREIGN KEY(payment_order_id) REFERENCES public.ac_payment_orders (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_program_regulations (
	id SERIAL NOT NULL, 
	plan_id INTEGER NOT NULL, 
	min_credits_per_semester INTEGER NOT NULL, 
	max_credits_per_semester INTEGER NOT NULL, 
	max_credits_under_warning INTEGER NOT NULL, 
	warning_gpa_threshold DOUBLE PRECISION NOT NULL, 
	field_training_min_credits INTEGER NOT NULL, 
	graduation_project_min_credits INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_program_regulations_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_program_regulations_plan_id_fkey FOREIGN KEY(plan_id) REFERENCES public.ac_curriculum_plans (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_registration_eligibility_policy (
	id SERIAL NOT NULL, 
	allow_higher_year BOOLEAN NOT NULL, 
	max_year_jump INTEGER NOT NULL, 
	min_gpa DOUBLE PRECISION NOT NULL, 
	min_earned_hours INTEGER NOT NULL, 
	require_advisor_approval_for_higher_year BOOLEAN NOT NULL, 
	allow_admin_override BOOLEAN NOT NULL, 
	strict_conflict_check BOOLEAN NOT NULL, 
	max_credits_normal INTEGER NOT NULL, 
	max_credits_overload INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_registration_eligibility_policy_pkey PRIMARY KEY (id)
);


CREATE TABLE public.ac_registration_requests (
	id SERIAL NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	submitted_at TIMESTAMP WITH TIME ZONE, 
	advisor_approved_at TIMESTAMP WITH TIME ZONE, 
	locked_at TIMESTAMP WITH TIME ZONE, 
	created_by_user_id INTEGER, 
	advisor_user_id INTEGER, 
	requested_note TEXT, 
	advisor_note TEXT, 
	requested_at TIMESTAMP WITH TIME ZONE, 
	handled_at TIMESTAMP WITH TIME ZONE, 
	processed_by_user_id INTEGER, 
	submitted_via VARCHAR(20) NOT NULL, 
	is_after_window BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_registration_requests_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_registration_requests_advisor_user_id_fkey FOREIGN KEY(advisor_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_registration_requests_created_by_user_id_fkey FOREIGN KEY(created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_registration_requests_processed_by_user_id_fkey FOREIGN KEY(processed_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_registration_requests_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_registration_selections (
	id SERIAL NOT NULL, 
	registration_request_id INTEGER NOT NULL, 
	offering_id INTEGER NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	display_title VARCHAR(255), 
	CONSTRAINT ac_registration_selections_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_registration_selections_offering_id_fkey FOREIGN KEY(offering_id) REFERENCES public.ac_course_offerings (id) ON DELETE CASCADE, 
	CONSTRAINT ac_registration_selections_registration_request_id_fkey FOREIGN KEY(registration_request_id) REFERENCES public.ac_registration_requests (id) ON DELETE CASCADE, 
	CONSTRAINT ac_registration_selections_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_registration_windows (
	id SERIAL NOT NULL, 
	college_id INTEGER, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	open_at TIMESTAMP WITH TIME ZONE, 
	close_at TIMESTAMP WITH TIME ZONE, 
	allows_self_registration BOOLEAN NOT NULL, 
	allows_advisor_registration BOOLEAN NOT NULL, 
	requires_financial_clearance BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_registration_windows_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_registration_windows_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL
);


CREATE TABLE public.ac_student_fee_adjustments (
	id SERIAL NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	adjustment_type VARCHAR(30) NOT NULL, 
	fee_item_id INTEGER, 
	value DOUBLE PRECISION NOT NULL, 
	reason TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_by_user_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_student_fee_adjustments_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_student_fee_adjustments_created_by_user_id_fkey FOREIGN KEY(created_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_fee_adjustments_fee_item_id_fkey FOREIGN KEY(fee_item_id) REFERENCES public.ac_payment_fee_items (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_fee_adjustments_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_student_finance_clearance (
	id SERIAL NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	academic_year_label VARCHAR(30) NOT NULL, 
	semester VARCHAR(20) NOT NULL, 
	clearance_status VARCHAR(20) NOT NULL, 
	source VARCHAR(30), 
	set_by_user_id INTEGER, 
	set_at TIMESTAMP WITH TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_student_finance_clearance_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_student_finance_clearance_set_by_user_id_fkey FOREIGN KEY(set_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_finance_clearance_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE, 
	CONSTRAINT uq_finance_clearance_term UNIQUE NULLS DISTINCT (student_user_id, academic_year_label, semester)
);


CREATE TABLE public.ac_student_finance_status (
	id SERIAL NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	cleared_by_user_id INTEGER, 
	cleared_at TIMESTAMP WITH TIME ZONE, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_student_finance_status_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_student_finance_status_cleared_by_user_id_fkey FOREIGN KEY(cleared_by_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_finance_status_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.ac_student_profiles (
	id SERIAL NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	college_id INTEGER, 
	entry_batch_year INTEGER, 
	current_study_year INTEGER NOT NULL, 
	current_track_id INTEGER, 
	advisor_user_id INTEGER, 
	gpa DOUBLE PRECISION NOT NULL, 
	passed_hours DOUBLE PRECISION NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT ac_student_profiles_pkey PRIMARY KEY (id), 
	CONSTRAINT ac_student_profiles_advisor_user_id_fkey FOREIGN KEY(advisor_user_id) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_profiles_college_id_fkey FOREIGN KEY(college_id) REFERENCES public.ac_colleges (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_profiles_current_track_id_fkey FOREIGN KEY(current_track_id) REFERENCES public.ac_college_tracks (id) ON DELETE SET NULL, 
	CONSTRAINT ac_student_profiles_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.academic_state (
	id INTEGER NOT NULL, 
	courses_json TEXT NOT NULL, 
	years_json TEXT NOT NULL, 
	open_semesters_json TEXT NOT NULL, 
	registration_settings_json TEXT NOT NULL, 
	student_registrations_json TEXT NOT NULL, 
	academic_records_json TEXT NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	grade_publish_map_json TEXT DEFAULT '{}'::text NOT NULL, 
	CONSTRAINT academic_state_pkey PRIMARY KEY (id)
);


CREATE TABLE public.account_requests (
	id SERIAL NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	national_id VARCHAR(50) NOT NULL, 
	college VARCHAR(100) NOT NULL, 
	level VARCHAR(50) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	review_note TEXT, 
	reviewed_by_user_id INTEGER, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT account_requests_pkey PRIMARY KEY (id)
);


CREATE TABLE public.admin_settings (
	id SERIAL NOT NULL, 
	admin_id INTEGER NOT NULL, 
	notify_live_chat BOOLEAN NOT NULL, 
	notify_summary BOOLEAN NOT NULL, 
	notify_feedback BOOLEAN NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT admin_settings_pkey PRIMARY KEY (id), 
	CONSTRAINT admin_settings_admin_id_fkey FOREIGN KEY(admin_id) REFERENCES public.users (id) ON DELETE CASCADE, 
	CONSTRAINT admin_settings_admin_id_key UNIQUE NULLS DISTINCT (admin_id)
);


CREATE TABLE public.assets (
	id SERIAL NOT NULL, 
	content_item_id INTEGER NOT NULL, 
	asset_type VARCHAR(24) NOT NULL, 
	label VARCHAR(255), 
	url VARCHAR(1024), 
	mime_type VARCHAR(120), 
	display_payload_json JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT assets_pkey PRIMARY KEY (id), 
	CONSTRAINT assets_content_item_id_fkey FOREIGN KEY(content_item_id) REFERENCES public.content_items (id)
);


CREATE TABLE public.attendance_records (
	id SERIAL NOT NULL, 
	session_id INTEGER NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	registration_selection_id INTEGER NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	marked_by INTEGER, 
	marked_method VARCHAR(20) NOT NULL, 
	marked_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT attendance_records_pkey PRIMARY KEY (id), 
	CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY(marked_by) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT attendance_records_registration_selection_id_fkey FOREIGN KEY(registration_selection_id) REFERENCES public.ac_registration_selections (id) ON DELETE CASCADE, 
	CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.attendance_sessions (id) ON DELETE CASCADE, 
	CONSTRAINT attendance_records_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE, 
	CONSTRAINT uq_attendance_record_session_student UNIQUE NULLS DISTINCT (session_id, student_user_id)
);


CREATE TABLE public.attendance_sessions (
	id SERIAL NOT NULL, 
	offering_id INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	session_date DATE NOT NULL, 
	start_time VARCHAR(5), 
	end_time VARCHAR(5), 
	status VARCHAR(20) NOT NULL, 
	qr_token VARCHAR(255), 
	qr_expires_at TIMESTAMP WITH TIME ZONE, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id), 
	CONSTRAINT attendance_sessions_created_by_fkey FOREIGN KEY(created_by) REFERENCES public.users (id) ON DELETE SET NULL, 
	CONSTRAINT attendance_sessions_offering_id_fkey FOREIGN KEY(offering_id) REFERENCES public.ac_course_offerings (id) ON DELETE CASCADE, 
	CONSTRAINT uq_attendance_session_slot UNIQUE NULLS DISTINCT (offering_id, session_date, start_time, title)
);


CREATE TABLE public.campus_places (
	id SERIAL NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	name_ar VARCHAR(255), 
	building_code VARCHAR(20), 
	category VARCHAR(100), 
	icon_key VARCHAR(100), 
	latitude DOUBLE PRECISION, 
	longitude DOUBLE PRECISION, 
	description TEXT, 
	description_ar TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	CONSTRAINT campus_places_pkey PRIMARY KEY (id)
);


CREATE TABLE public.chatbot_messages (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	role VARCHAR(10) NOT NULL, 
	text TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id), 
	CONSTRAINT chatbot_messages_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.chatbot_sessions (id) ON DELETE CASCADE
);


CREATE TABLE public.chatbot_sessions (
	id VARCHAR(64) NOT NULL, 
	student_id INTEGER NOT NULL, 
	title VARCHAR(255), 
	mode VARCHAR(20), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	CONSTRAINT chatbot_sessions_pkey PRIMARY KEY (id), 
	CONSTRAINT chatbot_sessions_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.chunk_asset_map (
	id SERIAL NOT NULL, 
	chunk_id INTEGER NOT NULL, 
	asset_id INTEGER NOT NULL, 
	relation_type VARCHAR(40) NOT NULL, 
	weight DOUBLE PRECISION NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT chunk_asset_map_pkey PRIMARY KEY (id), 
	CONSTRAINT chunk_asset_map_asset_id_fkey FOREIGN KEY(asset_id) REFERENCES public.assets (id), 
	CONSTRAINT chunk_asset_map_chunk_id_fkey FOREIGN KEY(chunk_id) REFERENCES public.knowledge_chunks (id)
);


CREATE TABLE public.content_items (
	id SERIAL NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	college VARCHAR(120), 
	year VARCHAR(40), 
	subject VARCHAR(255), 
	status VARCHAR(32) NOT NULL, 
	version INTEGER NOT NULL, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT content_items_pkey PRIMARY KEY (id), 
	CONSTRAINT content_items_created_by_fkey FOREIGN KEY(created_by) REFERENCES public.users (id)
);


CREATE TABLE public.content_posts (
	id SERIAL NOT NULL, 
	author_id INTEGER NOT NULL, 
	target_level VARCHAR(255), 
	subject VARCHAR(255) NOT NULL, 
	category VARCHAR(100), 
	body TEXT, 
	content_type VARCHAR(32), 
	tags TEXT, 
	college VARCHAR(255), 
	level VARCHAR(64), 
	program VARCHAR(128), 
	file_url VARCHAR(1024), 
	academic_year VARCHAR(32), 
	semester VARCHAR(64), 
	display_priority INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT content_posts_pkey PRIMARY KEY (id), 
	CONSTRAINT content_posts_author_id_fkey FOREIGN KEY(author_id) REFERENCES public.users (id)
);


CREATE TABLE public.conversation_ratings (
	id SERIAL NOT NULL, 
	conversation_id VARCHAR(64) NOT NULL, 
	student_id INTEGER NOT NULL, 
	score INTEGER NOT NULL, 
	comment TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT conversation_ratings_pkey PRIMARY KEY (id), 
	CONSTRAINT conversation_ratings_conversation_id_fkey FOREIGN KEY(conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE, 
	CONSTRAINT conversation_ratings_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.users (id)
);


CREATE TABLE public.conversations (
	id VARCHAR(64) NOT NULL, 
	student_id INTEGER NOT NULL, 
	assigned_admin_id INTEGER, 
	status VARCHAR(20) NOT NULL, 
	type VARCHAR(20) NOT NULL, 
	is_student_online BOOLEAN NOT NULL, 
	student_last_seen TIMESTAMP WITH TIME ZONE, 
	unread_for_admin INTEGER NOT NULL, 
	unread_for_student INTEGER NOT NULL, 
	last_message_text TEXT, 
	last_message_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT conversations_pkey PRIMARY KEY (id), 
	CONSTRAINT conversations_assigned_admin_id_fkey FOREIGN KEY(assigned_admin_id) REFERENCES public.users (id), 
	CONSTRAINT conversations_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.users (id)
);


CREATE TABLE public.feedback (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	user_name VARCHAR(255), 
	level VARCHAR(20), 
	status VARCHAR(20) NOT NULL, 
	message TEXT, 
	is_read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT feedback_pkey PRIMARY KEY (id), 
	CONSTRAINT feedback_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users (id)
);


CREATE TABLE public.knowledge_chunks (
	id SERIAL NOT NULL, 
	content_item_id INTEGER NOT NULL, 
	knowledge_document_id INTEGER NOT NULL, 
	chunk_text TEXT NOT NULL, 
	chunk_index INTEGER NOT NULL, 
	token_count INTEGER, 
	vector_ref VARCHAR(120), 
	college VARCHAR(120), 
	year VARCHAR(40), 
	subject VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id), 
	CONSTRAINT knowledge_chunks_content_item_id_fkey FOREIGN KEY(content_item_id) REFERENCES public.content_items (id), 
	CONSTRAINT knowledge_chunks_knowledge_document_id_fkey FOREIGN KEY(knowledge_document_id) REFERENCES public.knowledge_documents (id)
);


CREATE TABLE public.knowledge_documents (
	id SERIAL NOT NULL, 
	content_item_id INTEGER NOT NULL, 
	source_type VARCHAR(40) NOT NULL, 
	raw_text TEXT, 
	language VARCHAR(12), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id), 
	CONSTRAINT knowledge_documents_content_item_id_fkey FOREIGN KEY(content_item_id) REFERENCES public.content_items (id)
);


CREATE TABLE public.login_attempts (
	id SERIAL NOT NULL, 
	username_key VARCHAR(255) NOT NULL, 
	ip_address VARCHAR(64) NOT NULL, 
	failed_count INTEGER NOT NULL, 
	window_started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	last_failed_at TIMESTAMP WITH TIME ZONE, 
	locked_until TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT login_attempts_pkey PRIMARY KEY (id), 
	CONSTRAINT uq_login_attempt_username_ip UNIQUE NULLS DISTINCT (username_key, ip_address)
);


CREATE TABLE public.messages (
	id VARCHAR(64) NOT NULL, 
	conversation_id VARCHAR(64) NOT NULL, 
	sender_type VARCHAR(20) NOT NULL, 
	sender_user_id INTEGER, 
	sender_name VARCHAR(255), 
	text TEXT NOT NULL, 
	is_read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT messages_pkey PRIMARY KEY (id), 
	CONSTRAINT messages_conversation_id_fkey FOREIGN KEY(conversation_id) REFERENCES public.conversations (id) ON DELETE CASCADE, 
	CONSTRAINT messages_sender_user_id_fkey FOREIGN KEY(sender_user_id) REFERENCES public.users (id)
);


CREATE TABLE public.otp_requests (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	otp_hash VARCHAR(255) NOT NULL, 
	purpose VARCHAR(20) NOT NULL, 
	attempts INTEGER NOT NULL, 
	is_used BOOLEAN NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT otp_requests_pkey PRIMARY KEY (id), 
	CONSTRAINT otp_requests_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.payment_records (
	id SERIAL NOT NULL, 
	payment_reference VARCHAR(120) NOT NULL, 
	student_user_id INTEGER NOT NULL, 
	student_code VARCHAR(50) NOT NULL, 
	student_name VARCHAR(255) NOT NULL, 
	college VARCHAR(120), 
	gpa DOUBLE PRECISION NOT NULL, 
	base_tuition DOUBLE PRECISION NOT NULL, 
	discount_rate DOUBLE PRECISION NOT NULL, 
	discount_amount DOUBLE PRECISION NOT NULL, 
	tuition_after_discount DOUBLE PRECISION NOT NULL, 
	lab_fee DOUBLE PRECISION NOT NULL, 
	library_fee DOUBLE PRECISION NOT NULL, 
	activities_fee DOUBLE PRECISION NOT NULL, 
	insurance_fee DOUBLE PRECISION NOT NULL, 
	total_internal_fees DOUBLE PRECISION NOT NULL, 
	final_total DOUBLE PRECISION NOT NULL, 
	payment_method VARCHAR(20) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	notes TEXT, 
	slip_issued_at TIMESTAMP WITH TIME ZONE, 
	paid_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT payment_records_pkey PRIMARY KEY (id), 
	CONSTRAINT payment_records_student_user_id_fkey FOREIGN KEY(student_user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.quiz_submissions (
	id VARCHAR(64) NOT NULL, 
	quiz_id VARCHAR(64) NOT NULL, 
	student_id INTEGER NOT NULL, 
	student_name VARCHAR(255) NOT NULL, 
	quiz_title VARCHAR(255) NOT NULL, 
	course_code VARCHAR(50), 
	academic_year VARCHAR(30), 
	term VARCHAR(30), 
	section VARCHAR(30), 
	score INTEGER NOT NULL, 
	submitted_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT quiz_submissions_pkey PRIMARY KEY (id), 
	CONSTRAINT quiz_submissions_quiz_id_fkey FOREIGN KEY(quiz_id) REFERENCES public.quizzes (id) ON DELETE CASCADE, 
	CONSTRAINT quiz_submissions_student_id_fkey FOREIGN KEY(student_id) REFERENCES public.users (id)
);


CREATE TABLE public.quizzes (
	id VARCHAR(64) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	duration INTEGER NOT NULL, 
	start_time TIMESTAMP WITH TIME ZONE, 
	end_time TIMESTAMP WITH TIME ZONE, 
	questions_json TEXT NOT NULL, 
	course_code VARCHAR(50), 
	college_id VARCHAR(50), 
	visibility VARCHAR(20) NOT NULL, 
	academic_year VARCHAR(30), 
	term VARCHAR(30), 
	section VARCHAR(30), 
	is_active BOOLEAN NOT NULL, 
	created_by INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT quizzes_pkey PRIMARY KEY (id), 
	CONSTRAINT quizzes_created_by_fkey FOREIGN KEY(created_by) REFERENCES public.users (id)
);


CREATE TABLE public.storage_items (
	id SERIAL NOT NULL, 
	file_name VARCHAR(255) NOT NULL, 
	level VARCHAR(255), 
	owner_id INTEGER, 
	category VARCHAR(100), 
	is_favorite BOOLEAN NOT NULL, 
	is_indexed BOOLEAN NOT NULL, 
	stored_name VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	file_bytes BYTEA, 
	extracted_text TEXT, 
	chunks_count INTEGER DEFAULT 0, 
	indexing_status VARCHAR(32) DEFAULT 'pending'::character varying, 
	indexing_error TEXT, 
	college VARCHAR(200), 
	program VARCHAR(200), 
	academic_year VARCHAR(40), 
	semester VARCHAR(40), 
	keywords VARCHAR(500), 
	priority INTEGER DEFAULT 0, 
	source_type VARCHAR(40), 
	content_type VARCHAR(100), 
	CONSTRAINT storage_items_pkey PRIMARY KEY (id), 
	CONSTRAINT storage_items_owner_id_fkey FOREIGN KEY(owner_id) REFERENCES public.users (id)
);


CREATE TABLE public.user_contact_settings (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	display_name VARCHAR(255), 
	recovery_email VARCHAR(255), 
	phone_number VARCHAR(40), 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT user_contact_settings_pkey PRIMARY KEY (id), 
	CONSTRAINT user_contact_settings_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.user_profile_photos (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	stored_name VARCHAR(255) NOT NULL, 
	original_name VARCHAR(255) NOT NULL, 
	mime_type VARCHAR(100) NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	rejection_reason VARCHAR(500), 
	reviewed_by INTEGER, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	file_bytes BYTEA, 
	CONSTRAINT user_profile_photos_pkey PRIMARY KEY (id), 
	CONSTRAINT user_profile_photos_reviewed_by_fkey FOREIGN KEY(reviewed_by) REFERENCES public.users (id), 
	CONSTRAINT user_profile_photos_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users (id) ON DELETE CASCADE
);


CREATE TABLE public.user_sessions (
	id SERIAL NOT NULL, 
	session_id VARCHAR(128) NOT NULL, 
	user_id INTEGER NOT NULL, 
	ip_address VARCHAR(64), 
	user_agent VARCHAR(255), 
	is_active BOOLEAN NOT NULL, 
	revoked_reason VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ended_at TIMESTAMP WITH TIME ZONE, 
	CONSTRAINT user_sessions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.users (
	id SERIAL NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	student_code VARCHAR(50), 
	admission_year VARCHAR(20), 
	college VARCHAR(100), 
	major VARCHAR(100), 
	level VARCHAR(20), 
	national_id VARCHAR(50), 
	nationality VARCHAR(50), 
	gender VARCHAR(10), 
	birth_place VARCHAR(100), 
	is_active BOOLEAN NOT NULL, 
	theme_preference VARCHAR(10) NOT NULL, 
	avatar_size_px INTEGER NOT NULL, 
	must_change_password BOOLEAN NOT NULL, 
	password_changed_at TIMESTAMP WITH TIME ZONE, 
	password_history_json TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	CONSTRAINT users_pkey PRIMARY KEY (id), 
	CONSTRAINT users_student_code_key UNIQUE NULLS DISTINCT (student_code)
);

CREATE INDEX ix_ac_assessment_template_components_key ON public.ac_assessment_template_components (key);
CREATE INDEX ix_ac_assessment_template_components_template_id ON public.ac_assessment_template_components (template_id);

CREATE UNIQUE INDEX ix_ac_assessment_templates_code ON public.ac_assessment_templates (code);
CREATE INDEX ix_ac_assessment_templates_college_id ON public.ac_assessment_templates (college_id);
CREATE INDEX ix_ac_assessment_templates_effective_from_year ON public.ac_assessment_templates (effective_from_year);
CREATE INDEX ix_ac_assessment_templates_is_active ON public.ac_assessment_templates (is_active);
CREATE INDEX ix_ac_assessment_templates_is_default ON public.ac_assessment_templates (is_default);
CREATE INDEX ix_ac_assessment_templates_semester ON public.ac_assessment_templates (semester);
CREATE INDEX ix_ac_assessment_templates_study_year ON public.ac_assessment_templates (study_year);
CREATE INDEX ix_ac_assessment_templates_track_id ON public.ac_assessment_templates (track_id);

CREATE INDEX ix_ac_audit_logs_action ON public.ac_audit_logs (action);
CREATE INDEX ix_ac_audit_logs_actor_user_id ON public.ac_audit_logs (actor_user_id);
CREATE INDEX ix_ac_audit_logs_created_at ON public.ac_audit_logs (created_at);
CREATE INDEX ix_ac_audit_logs_entity_id ON public.ac_audit_logs (entity_id);
CREATE INDEX ix_ac_audit_logs_entity_type ON public.ac_audit_logs (entity_type);

CREATE INDEX ix_ac_bank_account_settings_academic_year_label ON public.ac_bank_account_settings (academic_year_label);
CREATE INDEX ix_ac_bank_account_settings_college_id ON public.ac_bank_account_settings (college_id);
CREATE INDEX ix_ac_bank_account_settings_is_active ON public.ac_bank_account_settings (is_active);
CREATE INDEX ix_ac_bank_account_settings_semester ON public.ac_bank_account_settings (semester);

CREATE UNIQUE INDEX ix_ac_bank_receipts_payment_transaction_id ON public.ac_bank_receipts (payment_transaction_id);
CREATE INDEX ix_ac_bank_receipts_receipt_no ON public.ac_bank_receipts (receipt_no);
CREATE INDEX ix_ac_bank_receipts_review_status ON public.ac_bank_receipts (review_status);
CREATE INDEX ix_ac_bank_receipts_reviewed_by_user_id ON public.ac_bank_receipts (reviewed_by_user_id);

CREATE INDEX ix_ac_college_credit_policy_tiers_college_id ON public.ac_college_credit_policy_tiers (college_id);
CREATE INDEX ix_ac_college_credit_policy_tiers_is_active ON public.ac_college_credit_policy_tiers (is_active);

CREATE INDEX ix_ac_college_tracks_code ON public.ac_college_tracks (code);
CREATE INDEX ix_ac_college_tracks_college_id ON public.ac_college_tracks (college_id);
CREATE INDEX ix_ac_college_tracks_is_active ON public.ac_college_tracks (is_active);

CREATE UNIQUE INDEX ix_ac_colleges_code ON public.ac_colleges (code);
CREATE INDEX ix_ac_colleges_is_active ON public.ac_colleges (is_active);

CREATE INDEX ix_ac_course_catalog_assessment_template_id ON public.ac_course_catalog (assessment_template_id);
CREATE INDEX ix_ac_course_catalog_code ON public.ac_course_catalog (code);
CREATE INDEX ix_ac_course_catalog_college_id ON public.ac_course_catalog (college_id);
CREATE INDEX ix_ac_course_catalog_grading_scale_id ON public.ac_course_catalog (grading_scale_id);
CREATE INDEX ix_ac_course_catalog_is_active ON public.ac_course_catalog (is_active);
CREATE INDEX ix_ac_course_catalog_is_shared ON public.ac_course_catalog (is_shared);
CREATE INDEX ix_ac_course_catalog_plan_id ON public.ac_course_catalog (plan_id);
CREATE INDEX ix_ac_course_catalog_semester ON public.ac_course_catalog (semester);
CREATE INDEX ix_ac_course_catalog_study_year ON public.ac_course_catalog (study_year);
CREATE INDEX ix_ac_course_catalog_track_id ON public.ac_course_catalog (track_id);

CREATE INDEX ix_ac_course_offerings_academic_year_label ON public.ac_course_offerings (academic_year_label);
CREATE INDEX ix_ac_course_offerings_course_id ON public.ac_course_offerings (course_id);
CREATE INDEX ix_ac_course_offerings_day_of_week ON public.ac_course_offerings (day_of_week);
CREATE INDEX ix_ac_course_offerings_instructor_user_id ON public.ac_course_offerings (instructor_user_id);
CREATE INDEX ix_ac_course_offerings_is_active ON public.ac_course_offerings (is_active);
CREATE INDEX ix_ac_course_offerings_room_name ON public.ac_course_offerings (room_name);
CREATE INDEX ix_ac_course_offerings_section ON public.ac_course_offerings (section);
CREATE INDEX ix_ac_course_offerings_semester ON public.ac_course_offerings (semester);
CREATE INDEX ix_ac_course_offerings_target_group_id ON public.ac_course_offerings (target_group_id);

CREATE INDEX ix_ac_course_prerequisites_course_id ON public.ac_course_prerequisites (course_id);
CREATE INDEX ix_ac_course_prerequisites_prerequisite_course_id ON public.ac_course_prerequisites (prerequisite_course_id);

CREATE INDEX ix_ac_curriculum_plans_batch_year ON public.ac_curriculum_plans (batch_year);
CREATE INDEX ix_ac_curriculum_plans_college_id ON public.ac_curriculum_plans (college_id);
CREATE INDEX ix_ac_curriculum_plans_is_active ON public.ac_curriculum_plans (is_active);

CREATE INDEX ix_ac_gpa_discount_policies_academic_year_label ON public.ac_gpa_discount_policies (academic_year_label);
CREATE INDEX ix_ac_gpa_discount_policies_college_id ON public.ac_gpa_discount_policies (college_id);
CREATE INDEX ix_ac_gpa_discount_policies_is_active ON public.ac_gpa_discount_policies (is_active);
CREATE INDEX ix_ac_gpa_discount_policies_priority ON public.ac_gpa_discount_policies (priority);
CREATE INDEX ix_ac_gpa_discount_policies_semester ON public.ac_gpa_discount_policies (semester);

CREATE INDEX ix_ac_grade_import_batches_created_by_user_id ON public.ac_grade_import_batches (created_by_user_id);
CREATE INDEX ix_ac_grade_import_batches_import_cycle ON public.ac_grade_import_batches (import_cycle);
CREATE INDEX ix_ac_grade_import_batches_offering_id ON public.ac_grade_import_batches (offering_id);
CREATE INDEX ix_ac_grade_import_batches_status ON public.ac_grade_import_batches (status);

CREATE INDEX ix_ac_gradebook_import_cycle ON public.ac_gradebook (import_cycle);
CREATE INDEX ix_ac_gradebook_last_updated_by_user_id ON public.ac_gradebook (last_updated_by_user_id);
CREATE INDEX ix_ac_gradebook_offering_id ON public.ac_gradebook (offering_id);
CREATE INDEX ix_ac_gradebook_publish_status ON public.ac_gradebook (publish_status);
CREATE INDEX ix_ac_gradebook_selection_id ON public.ac_gradebook (selection_id);
CREATE INDEX ix_ac_gradebook_student_user_id ON public.ac_gradebook (student_user_id);

CREATE INDEX ix_ac_grading_scale_items_grade_code ON public.ac_grading_scale_items (grade_code);
CREATE INDEX ix_ac_grading_scale_items_scale_id ON public.ac_grading_scale_items (scale_id);

CREATE UNIQUE INDEX ix_ac_grading_scales_code ON public.ac_grading_scales (code);
CREATE INDEX ix_ac_grading_scales_college_id ON public.ac_grading_scales (college_id);
CREATE INDEX ix_ac_grading_scales_is_active ON public.ac_grading_scales (is_active);
CREATE INDEX ix_ac_grading_scales_is_default ON public.ac_grading_scales (is_default);

CREATE INDEX ix_ac_late_penalty_rules_academic_year_label ON public.ac_late_penalty_rules (academic_year_label);
CREATE INDEX ix_ac_late_penalty_rules_college_id ON public.ac_late_penalty_rules (college_id);
CREATE INDEX ix_ac_late_penalty_rules_is_active ON public.ac_late_penalty_rules (is_active);
CREATE INDEX ix_ac_late_penalty_rules_semester ON public.ac_late_penalty_rules (semester);

CREATE INDEX ix_ac_notifications_user_id ON public.ac_notifications (user_id);

CREATE INDEX ix_ac_payment_configs_academic_year_label ON public.ac_payment_configs (academic_year_label);
CREATE INDEX ix_ac_payment_configs_batch_year ON public.ac_payment_configs (batch_year);
CREATE INDEX ix_ac_payment_configs_college_id ON public.ac_payment_configs (college_id);
CREATE INDEX ix_ac_payment_configs_is_active ON public.ac_payment_configs (is_active);
CREATE INDEX ix_ac_payment_configs_semester ON public.ac_payment_configs (semester);

CREATE INDEX ix_ac_payment_fee_items_academic_year_label ON public.ac_payment_fee_items (academic_year_label);
CREATE INDEX ix_ac_payment_fee_items_college_id ON public.ac_payment_fee_items (college_id);
CREATE INDEX ix_ac_payment_fee_items_is_active ON public.ac_payment_fee_items (is_active);
CREATE INDEX ix_ac_payment_fee_items_item_code ON public.ac_payment_fee_items (item_code);
CREATE INDEX ix_ac_payment_fee_items_semester ON public.ac_payment_fee_items (semester);

CREATE INDEX ix_ac_payment_orders_academic_year_label ON public.ac_payment_orders (academic_year_label);
CREATE INDEX ix_ac_payment_orders_college_id ON public.ac_payment_orders (college_id);
CREATE UNIQUE INDEX ix_ac_payment_orders_order_no ON public.ac_payment_orders (order_no);
CREATE INDEX ix_ac_payment_orders_registration_unlock_status ON public.ac_payment_orders (registration_unlock_status);
CREATE INDEX ix_ac_payment_orders_semester ON public.ac_payment_orders (semester);
CREATE INDEX ix_ac_payment_orders_status ON public.ac_payment_orders (status);
CREATE INDEX ix_ac_payment_orders_student_user_id ON public.ac_payment_orders (student_user_id);

CREATE UNIQUE INDEX ix_ac_payment_transactions_idempotency_key ON public.ac_payment_transactions (idempotency_key);
CREATE INDEX ix_ac_payment_transactions_method ON public.ac_payment_transactions (method);
CREATE INDEX ix_ac_payment_transactions_payment_order_id ON public.ac_payment_transactions (payment_order_id);
CREATE INDEX ix_ac_payment_transactions_provider ON public.ac_payment_transactions (provider);
CREATE INDEX ix_ac_payment_transactions_provider_ref ON public.ac_payment_transactions (provider_ref);
CREATE INDEX ix_ac_payment_transactions_status ON public.ac_payment_transactions (status);

CREATE UNIQUE INDEX ix_ac_program_regulations_plan_id ON public.ac_program_regulations (plan_id);

CREATE INDEX ix_ac_registration_eligibility_policy_is_active ON public.ac_registration_eligibility_policy (is_active);

CREATE INDEX ix_ac_registration_requests_academic_year_label ON public.ac_registration_requests (academic_year_label);
CREATE INDEX ix_ac_registration_requests_advisor_user_id ON public.ac_registration_requests (advisor_user_id);
CREATE INDEX ix_ac_registration_requests_created_by_user_id ON public.ac_registration_requests (created_by_user_id);
CREATE INDEX ix_ac_registration_requests_handled_at ON public.ac_registration_requests (handled_at);
CREATE INDEX ix_ac_registration_requests_is_after_window ON public.ac_registration_requests (is_after_window);
CREATE INDEX ix_ac_registration_requests_processed_by_user_id ON public.ac_registration_requests (processed_by_user_id);
CREATE INDEX ix_ac_registration_requests_requested_at ON public.ac_registration_requests (requested_at);
CREATE INDEX ix_ac_registration_requests_semester ON public.ac_registration_requests (semester);
CREATE INDEX ix_ac_registration_requests_status ON public.ac_registration_requests (status);
CREATE INDEX ix_ac_registration_requests_student_user_id ON public.ac_registration_requests (student_user_id);
CREATE INDEX ix_ac_registration_requests_submitted_via ON public.ac_registration_requests (submitted_via);

CREATE INDEX ix_ac_registration_selections_offering_id ON public.ac_registration_selections (offering_id);
CREATE INDEX ix_ac_registration_selections_registration_request_id ON public.ac_registration_selections (registration_request_id);
CREATE INDEX ix_ac_registration_selections_status ON public.ac_registration_selections (status);
CREATE INDEX ix_ac_registration_selections_student_user_id ON public.ac_registration_selections (student_user_id);

CREATE INDEX ix_ac_registration_windows_academic_year_label ON public.ac_registration_windows (academic_year_label);
CREATE INDEX ix_ac_registration_windows_college_id ON public.ac_registration_windows (college_id);
CREATE INDEX ix_ac_registration_windows_is_active ON public.ac_registration_windows (is_active);
CREATE INDEX ix_ac_registration_windows_semester ON public.ac_registration_windows (semester);
CREATE INDEX ix_ac_registration_windows_status ON public.ac_registration_windows (status);

CREATE INDEX ix_ac_student_fee_adjustments_academic_year_label ON public.ac_student_fee_adjustments (academic_year_label);
CREATE INDEX ix_ac_student_fee_adjustments_created_by_user_id ON public.ac_student_fee_adjustments (created_by_user_id);
CREATE INDEX ix_ac_student_fee_adjustments_fee_item_id ON public.ac_student_fee_adjustments (fee_item_id);
CREATE INDEX ix_ac_student_fee_adjustments_is_active ON public.ac_student_fee_adjustments (is_active);
CREATE INDEX ix_ac_student_fee_adjustments_semester ON public.ac_student_fee_adjustments (semester);
CREATE INDEX ix_ac_student_fee_adjustments_student_user_id ON public.ac_student_fee_adjustments (student_user_id);

CREATE INDEX ix_ac_student_finance_clearance_academic_year_label ON public.ac_student_finance_clearance (academic_year_label);
CREATE INDEX ix_ac_student_finance_clearance_clearance_status ON public.ac_student_finance_clearance (clearance_status);
CREATE INDEX ix_ac_student_finance_clearance_semester ON public.ac_student_finance_clearance (semester);
CREATE INDEX ix_ac_student_finance_clearance_set_by_user_id ON public.ac_student_finance_clearance (set_by_user_id);
CREATE INDEX ix_ac_student_finance_clearance_student_user_id ON public.ac_student_finance_clearance (student_user_id);

CREATE INDEX ix_ac_student_finance_status_cleared_by_user_id ON public.ac_student_finance_status (cleared_by_user_id);
CREATE INDEX ix_ac_student_finance_status_status ON public.ac_student_finance_status (status);
CREATE UNIQUE INDEX ix_ac_student_finance_status_student_user_id ON public.ac_student_finance_status (student_user_id);

CREATE INDEX ix_ac_student_profiles_advisor_user_id ON public.ac_student_profiles (advisor_user_id);
CREATE INDEX ix_ac_student_profiles_college_id ON public.ac_student_profiles (college_id);
CREATE INDEX ix_ac_student_profiles_current_track_id ON public.ac_student_profiles (current_track_id);
CREATE INDEX ix_ac_student_profiles_entry_batch_year ON public.ac_student_profiles (entry_batch_year);
CREATE INDEX ix_ac_student_profiles_is_active ON public.ac_student_profiles (is_active);
CREATE UNIQUE INDEX ix_ac_student_profiles_student_user_id ON public.ac_student_profiles (student_user_id);

CREATE INDEX ix_account_requests_email ON public.account_requests (email);
CREATE INDEX ix_account_requests_national_id ON public.account_requests (national_id);
CREATE INDEX ix_account_requests_status ON public.account_requests (status);

CREATE INDEX ix_assets_content_item_id ON public.assets (content_item_id);

CREATE INDEX ix_attendance_records_marked_by ON public.attendance_records (marked_by);
CREATE INDEX ix_attendance_records_marked_method ON public.attendance_records (marked_method);
CREATE INDEX ix_attendance_records_registration_selection_id ON public.attendance_records (registration_selection_id);
CREATE INDEX ix_attendance_records_session_id ON public.attendance_records (session_id);
CREATE INDEX ix_attendance_records_status ON public.attendance_records (status);
CREATE INDEX ix_attendance_records_student_user_id ON public.attendance_records (student_user_id);

CREATE INDEX ix_attendance_sessions_created_by ON public.attendance_sessions (created_by);
CREATE INDEX ix_attendance_sessions_offering_id ON public.attendance_sessions (offering_id);
CREATE INDEX ix_attendance_sessions_qr_token ON public.attendance_sessions (qr_token);
CREATE INDEX ix_attendance_sessions_session_date ON public.attendance_sessions (session_date);
CREATE INDEX ix_attendance_sessions_status ON public.attendance_sessions (status);

CREATE INDEX ix_campus_places_category ON public.campus_places (category);
CREATE INDEX ix_campus_places_id ON public.campus_places (id);
CREATE INDEX ix_campus_places_name ON public.campus_places (name);

CREATE INDEX ix_chunk_asset_map_asset_id ON public.chunk_asset_map (asset_id);
CREATE INDEX ix_chunk_asset_map_chunk_id ON public.chunk_asset_map (chunk_id);

CREATE UNIQUE INDEX ix_conversation_ratings_conversation_id ON public.conversation_ratings (conversation_id);
CREATE INDEX ix_conversation_ratings_student_id ON public.conversation_ratings (student_id);

CREATE INDEX ix_conversations_assigned_admin_id ON public.conversations (assigned_admin_id);
CREATE INDEX ix_conversations_status ON public.conversations (status);
CREATE INDEX ix_conversations_student_id ON public.conversations (student_id);

CREATE INDEX ix_knowledge_chunks_college ON public.knowledge_chunks (college);
CREATE INDEX ix_knowledge_chunks_content_item_id ON public.knowledge_chunks (content_item_id);
CREATE INDEX ix_knowledge_chunks_knowledge_document_id ON public.knowledge_chunks (knowledge_document_id);
CREATE INDEX ix_knowledge_chunks_subject ON public.knowledge_chunks (subject);
CREATE INDEX ix_knowledge_chunks_year ON public.knowledge_chunks (year);

CREATE INDEX ix_knowledge_documents_content_item_id ON public.knowledge_documents (content_item_id);

CREATE INDEX ix_login_attempts_ip_address ON public.login_attempts (ip_address);
CREATE INDEX ix_login_attempts_username_key ON public.login_attempts (username_key);

CREATE INDEX ix_messages_conversation_id ON public.messages (conversation_id);
CREATE INDEX ix_messages_created_at ON public.messages (created_at);

CREATE INDEX ix_otp_requests_expires_at ON public.otp_requests (expires_at);
CREATE INDEX ix_otp_requests_user_id ON public.otp_requests (user_id);

CREATE UNIQUE INDEX ix_payment_records_payment_reference ON public.payment_records (payment_reference);
CREATE INDEX ix_payment_records_status ON public.payment_records (status);
CREATE INDEX ix_payment_records_student_code ON public.payment_records (student_code);
CREATE INDEX ix_payment_records_student_user_id ON public.payment_records (student_user_id);

CREATE INDEX ix_quiz_submissions_academic_year ON public.quiz_submissions (academic_year);
CREATE INDEX ix_quiz_submissions_course_code ON public.quiz_submissions (course_code);
CREATE INDEX ix_quiz_submissions_quiz_id ON public.quiz_submissions (quiz_id);
CREATE INDEX ix_quiz_submissions_section ON public.quiz_submissions (section);
CREATE INDEX ix_quiz_submissions_student_id ON public.quiz_submissions (student_id);
CREATE INDEX ix_quiz_submissions_submitted_at ON public.quiz_submissions (submitted_at);
CREATE INDEX ix_quiz_submissions_term ON public.quiz_submissions (term);

CREATE INDEX ix_quizzes_academic_year ON public.quizzes (academic_year);
CREATE INDEX ix_quizzes_college_id ON public.quizzes (college_id);
CREATE INDEX ix_quizzes_course_code ON public.quizzes (course_code);
CREATE INDEX ix_quizzes_created_at ON public.quizzes (created_at);
CREATE INDEX ix_quizzes_created_by ON public.quizzes (created_by);
CREATE INDEX ix_quizzes_is_active ON public.quizzes (is_active);
CREATE INDEX ix_quizzes_section ON public.quizzes (section);
CREATE INDEX ix_quizzes_term ON public.quizzes (term);
CREATE INDEX ix_quizzes_visibility ON public.quizzes (visibility);

CREATE UNIQUE INDEX ix_user_contact_settings_user_id ON public.user_contact_settings (user_id);

CREATE INDEX ix_user_profile_photos_created_at ON public.user_profile_photos (created_at);
CREATE INDEX ix_user_profile_photos_reviewed_by ON public.user_profile_photos (reviewed_by);
CREATE INDEX ix_user_profile_photos_status ON public.user_profile_photos (status);
CREATE UNIQUE INDEX ix_user_profile_photos_stored_name ON public.user_profile_photos (stored_name);
CREATE INDEX ix_user_profile_photos_user_id ON public.user_profile_photos (user_id);

CREATE INDEX ix_user_sessions_is_active ON public.user_sessions (is_active);
CREATE UNIQUE INDEX ix_user_sessions_session_id ON public.user_sessions (session_id);
CREATE INDEX ix_user_sessions_user_id ON public.user_sessions (user_id);

CREATE UNIQUE INDEX ix_users_email ON public.users (email);
CREATE INDEX ix_users_role ON public.users (role);
CREATE UNIQUE INDEX ix_users_username ON public.users (username);
