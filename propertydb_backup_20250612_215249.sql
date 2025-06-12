--
-- PostgreSQL database dump
--

-- Dumped from database version 14.18 (Homebrew)
-- Dumped by pg_dump version 14.18 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.admins (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    is_active boolean DEFAULT true,
    last_login timestamp without time zone,
    password_changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admins OWNER TO fatemehrahimi;

--
-- Name: admins_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.admins_id_seq OWNER TO fatemehrahimi;

--
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- Name: email_notifications; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.email_notifications (
    id integer NOT NULL,
    user_id integer,
    property_id integer,
    notification_type character varying(50),
    email_subject character varying(255),
    email_body text,
    sent_to character varying(255),
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'sent'::character varying
);


ALTER TABLE public.email_notifications OWNER TO fatemehrahimi;

--
-- Name: email_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.email_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.email_notifications_id_seq OWNER TO fatemehrahimi;

--
-- Name: email_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.email_notifications_id_seq OWNED BY public.email_notifications.id;


--
-- Name: properties; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.properties (
    id integer NOT NULL,
    user_id integer,
    title character varying(255) NOT NULL,
    description text,
    property_type character varying(50) NOT NULL,
    property_category character varying(50),
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state character varying(100),
    zip_code character varying(20),
    country character varying(100) DEFAULT 'USA'::character varying,
    bedrooms integer,
    bathrooms numeric(3,1),
    square_feet integer,
    lot_size numeric(10,2),
    year_built integer,
    price numeric(12,2),
    monthly_rent numeric(10,2),
    lease_term integer,
    deposit_amount numeric(10,2),
    parking_spaces integer DEFAULT 0,
    has_garage boolean DEFAULT false,
    has_pool boolean DEFAULT false,
    has_garden boolean DEFAULT false,
    furnished boolean DEFAULT false,
    pets_allowed boolean DEFAULT false,
    status character varying(20) DEFAULT 'pending'::character varying,
    featured boolean DEFAULT false,
    availability_date date,
    contact_name character varying(255),
    contact_phone character varying(20),
    contact_email character varying(255),
    slug character varying(255),
    meta_keywords text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp without time zone,
    approved_by integer,
    student_housing boolean DEFAULT false,
    short_description text,
    weekly_rent numeric(10,2)
);


ALTER TABLE public.properties OWNER TO fatemehrahimi;

--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.properties_id_seq OWNER TO fatemehrahimi;

--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.properties_id_seq OWNED BY public.properties.id;


--
-- Name: property_amenities; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.property_amenities (
    id integer NOT NULL,
    property_id integer,
    amenity_name character varying(100) NOT NULL,
    amenity_category character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_amenities OWNER TO fatemehrahimi;

--
-- Name: property_amenities_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.property_amenities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_amenities_id_seq OWNER TO fatemehrahimi;

--
-- Name: property_amenities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.property_amenities_id_seq OWNED BY public.property_amenities.id;


--
-- Name: property_images; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.property_images (
    id integer NOT NULL,
    property_id integer,
    image_url character varying(500) NOT NULL,
    image_type character varying(50),
    image_order integer DEFAULT 0,
    alt_text character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_images OWNER TO fatemehrahimi;

--
-- Name: property_images_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.property_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_images_id_seq OWNER TO fatemehrahimi;

--
-- Name: property_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.property_images_id_seq OWNED BY public.property_images.id;


--
-- Name: property_submissions; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.property_submissions (
    id integer NOT NULL,
    property_id integer,
    user_id integer,
    submission_type character varying(50),
    admin_notes text,
    rejection_reason text,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_submissions OWNER TO fatemehrahimi;

--
-- Name: property_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.property_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_submissions_id_seq OWNER TO fatemehrahimi;

--
-- Name: property_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.property_submissions_id_seq OWNED BY public.property_submissions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: fatemehrahimi
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    first_name character varying(100),
    last_name character varying(100),
    google_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    picture text,
    is_verified boolean DEFAULT false,
    reset_token character varying(255),
    reset_token_expiry timestamp without time zone,
    role character varying(20) DEFAULT 'user'::character varying,
    phone character varying(20)
);


ALTER TABLE public.users OWNER TO fatemehrahimi;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: fatemehrahimi
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO fatemehrahimi;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: fatemehrahimi
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- Name: email_notifications id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.email_notifications ALTER COLUMN id SET DEFAULT nextval('public.email_notifications_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.properties ALTER COLUMN id SET DEFAULT nextval('public.properties_id_seq'::regclass);


--
-- Name: property_amenities id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_amenities ALTER COLUMN id SET DEFAULT nextval('public.property_amenities_id_seq'::regclass);


--
-- Name: property_images id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_images ALTER COLUMN id SET DEFAULT nextval('public.property_images_id_seq'::regclass);


--
-- Name: property_submissions id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_submissions ALTER COLUMN id SET DEFAULT nextval('public.property_submissions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.admins (id, email, password, first_name, last_name, role, is_active, last_login, password_changed_at, created_at, updated_at) FROM stdin;
2	manager@property.com	$2a$10$FFHPJUcpGAKx/6O/ZX061eMesOYA5RiB6KPSffq/274w1AcPCfIyG	Property	Manager	admin	t	\N	2025-06-05 15:54:12.042587	2025-06-05 15:54:12.042587	2025-06-05 15:54:12.042587
3	sales@property.com	$2a$10$BjIDCXjvP1Qi6QmOKwtk5OpqbHtbk9Q5Xr2of6BGMfyPFAbaRBfNS	Sales	Director	admin	t	\N	2025-06-05 15:54:12.123639	2025-06-05 15:54:12.123639	2025-06-05 15:54:12.123639
4	support@property.com	$2a$10$LjO0P6he1KpIIsqvPV87MuDHUwZa012kBf.O/tNIKJjw.TOcy1Z5K	Support	Lead	admin	t	\N	2025-06-05 15:54:12.199737	2025-06-05 15:54:12.199737	2025-06-05 15:54:12.199737
5	sysadmin@property.com	$2a$10$7OFFrjCdyXNntxuCEcG4dOmnH4nKeW11CEoD8BMcRKjf244Z.gVYO	System	Administrator	admin	t	\N	2025-06-05 15:54:12.292568	2025-06-05 15:54:12.292568	2025-06-05 15:54:12.292568
1	fa.rahimi5475@gmail.com	$2a$10$0rrFKuTf7gMx3oq1UC7/MeQ2SOR6uM.t8znsJQLQCW16RnmJuetZq	Shahrzad	Rahimi	super_admin	t	2025-06-11 19:56:40.944661	2025-06-05 15:54:11.950498	2025-06-05 15:54:11.950498	2025-06-05 15:54:11.950498
\.


--
-- Data for Name: email_notifications; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.email_notifications (id, user_id, property_id, notification_type, email_subject, email_body, sent_to, sent_at, status) FROM stdin;
1	30	2	submission_confirm	Property Submission Confirmed - Beautiful Family Home	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Beautiful Family Home</h3>\n          <p><strong>Type:</strong> Sale</p>\n          <p><strong>Address:</strong> 123 Maple Street, San Francisco, CA 94102</p>\n          <p><strong>Price:</strong> $750,000</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/6/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-06 00:03:32.345655	sent
2	30	2	admin_alert	🏠 New Property Submission: Beautiful Family Home	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Beautiful Family Home</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Sale</p>\n          <p><strong>Address:</strong> 123 Maple Street, San Francisco, CA 94102</p>\n          <p><strong>Price:</strong> $750,000</p>\n          <p><strong>Submitted:</strong> 6/6/2025, 12:03:32 AM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-06 00:03:33.895689	sent
3	30	2	approval	🎉 Property Approved: Beautiful Family Home	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">Beautiful Family Home</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/6/2025</p>\n          <p><strong>Admin Notes:</strong> Great property listing! Approved for publication.</p>\n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/beautiful-family-home-1749164608651" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-06 00:10:42.962914	sent
4	30	3	submission_confirm	Property Submission Confirmed - hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">hhhh</h3>\n          <p><strong>Type:</strong> Sale</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $5,000</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/9/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 11:17:18.006915	sent
5	30	3	admin_alert	🏠 New Property Submission: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">hhhh</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Sale</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $5,000</p>\n          <p><strong>Submitted:</strong> 6/9/2025, 11:17:18 AM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 11:17:19.270851	sent
6	30	3	approval	🎉 Property Approved: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">hhhh</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/9/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/hhhh-1749464236129" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 11:34:43.193145	sent
7	30	3	approval	🎉 Property Approved: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">hhhh</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/9/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/hhhh-1749464236129" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 11:34:45.043225	sent
8	30	3	approval	🎉 Property Approved: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">hhhh</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/9/2025</p>\n          <p><strong>Admin Notes:</strong> Use precise geolocation data. Actively scan device characteristics for identification. Store and/or access information on a device. Personalised advertising and content, advertising and content measurement, audience research and services development.</p>\n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/hhhh-1749464236129" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 12:21:12.763242	sent
9	30	3	rejection	📝 Property Review Required: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">hhhh</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> bbbb</p>\n          <p><strong>Admin Notes:</strong> bbbb</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 12:22:55.525924	sent
10	30	3	rejection	📝 Property Review Required: hhhh	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">hhhh</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> bbbb</p>\n          <p><strong>Admin Notes:</strong> bbbb</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 12:22:57.294779	sent
11	30	4	submission_confirm	Property Submission Confirmed - dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">dad</h3>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $2/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/9/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:35:02.554606	sent
12	30	4	admin_alert	🏠 New Property Submission: dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">dad</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $2/month</p>\n          <p><strong>Submitted:</strong> 6/9/2025, 11:35:02 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:35:04.995782	sent
13	30	5	submission_confirm	Property Submission Confirmed - kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">kkk</h3>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $5/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/9/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:47:34.693884	sent
14	30	5	admin_alert	🏠 New Property Submission: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">kkk</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $5/month</p>\n          <p><strong>Submitted:</strong> 6/9/2025, 11:47:34 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:47:35.844168	sent
15	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> GOHHHH TOOOSH</p>\n          <p><strong>Admin Notes:</strong> GOHHHHHH</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:52:26.102933	sent
31	30	9	admin_alert	🏠 New Property Submission: central	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">central</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $230/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 12:05:10 AM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 00:05:12.876882	sent
16	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> GOHHHH TOOOSH</p>\n          <p><strong>Admin Notes:</strong> GOHHHHHH</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:52:26.927487	sent
17	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> GOHHHH TOOOSH</p>\n          <p><strong>Admin Notes:</strong> GOHHHHHH</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:52:27.299843	sent
18	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> GOHHHH TOOOSH</p>\n          <p><strong>Admin Notes:</strong> GOHHHHHH</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:52:27.788872	sent
19	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> GOHHHH TOOOSH</p>\n          <p><strong>Admin Notes:</strong> GOHHHHHH</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:52:28.188939	sent
20	30	4	approval	🎉 Property Approved: dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">dad</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/9/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/dad-1749508500417" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:55:54.556615	sent
21	30	5	rejection	📝 Property Review Required: kkk	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">kkk</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/9/2025</p>\n          <p><strong>Required Changes:</strong> jjjjjjj</p>\n          <p><strong>Admin Notes:</strong> jjjj</p>\n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:56:20.781233	sent
22	30	6	submission_confirm	Property Submission Confirmed - 2 bed flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> Old Road Campus, Oxford, undefined OX37LF</p>\n          <p><strong>Price:</strong> $3000/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/11/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:33:42.200414	sent
23	30	6	admin_alert	🏠 New Property Submission: 2 bed flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> Old Road Campus, Oxford, undefined OX37LF</p>\n          <p><strong>Price:</strong> $3000/month</p>\n          <p><strong>Submitted:</strong> 6/11/2025, 7:33:42 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:33:43.552757	sent
24	30	7	submission_confirm	Property Submission Confirmed - 2 flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, westmidland B 46GE</p>\n          <p><strong>Price:</strong> $2000/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/11/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:49:08.374427	sent
25	30	7	admin_alert	🏠 New Property Submission: 2 flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, westmidland B 46GE</p>\n          <p><strong>Price:</strong> $2000/month</p>\n          <p><strong>Submitted:</strong> 6/11/2025, 7:49:08 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:49:09.674435	sent
37	30	12	admin_alert	🏠 New Property Submission: modern 2 flat in central landon	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">modern 2 flat in central landon</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 279 Hospital Street, Birmingham, undefined b154fu</p>\n          <p><strong>Price:</strong> $1000/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 6:19:55 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:19:57.034084	sent
26	30	7	approval	🎉 Property Approved: 2 flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">2 flat</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/11/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/2-flat-1749667746961" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:56:59.331265	sent
27	30	6	approval	🎉 Property Approved: 2 bed flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">2 bed flat</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/11/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/2-bed-flat-1749666820488" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 19:57:04.531343	sent
28	30	8	submission_confirm	Property Submission Confirmed - 2 bed flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $4000/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/11/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 21:53:30.38604	sent
29	30	8	admin_alert	🏠 New Property Submission: 2 bed flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $4000/month</p>\n          <p><strong>Submitted:</strong> 6/11/2025, 9:53:30 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-11 21:53:32.411448	sent
30	30	9	submission_confirm	Property Submission Confirmed - central	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">central</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $230/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 00:05:10.852547	sent
32	30	10	submission_confirm	Property Submission Confirmed - 1 bed 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">1 bed </h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 222 Hospital Street, Birmingham, undefined B19 2gz</p>\n          <p><strong>Price:</strong> $1300/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 13:29:56.135727	sent
33	30	10	admin_alert	🏠 New Property Submission: 1 bed 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">1 bed </h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 222 Hospital Street, Birmingham, undefined B19 2gz</p>\n          <p><strong>Price:</strong> $1300/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 1:29:56 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 13:29:57.733857	sent
34	30	11	submission_confirm	Property Submission Confirmed - 2 bed falat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed falat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:14:53.613703	sent
35	30	11	admin_alert	🏠 New Property Submission: 2 bed falat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed falat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 6:14:53 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:14:54.981512	sent
36	30	12	submission_confirm	Property Submission Confirmed - modern 2 flat in central landon	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">modern 2 flat in central landon</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 279 Hospital Street, Birmingham, undefined b154fu</p>\n          <p><strong>Price:</strong> $1000/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:19:55.638746	sent
38	30	13	submission_confirm	Property Submission Confirmed - the beutiful 2 flat 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">the beutiful 2 flat </h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2CF</p>\n          <p><strong>Price:</strong> $879/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:38:16.118087	sent
39	30	13	admin_alert	🏠 New Property Submission: the beutiful 2 flat 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">the beutiful 2 flat </h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2CF</p>\n          <p><strong>Price:</strong> $879/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 6:38:16 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:38:17.468131	sent
40	30	14	submission_confirm	Property Submission Confirmed - Beutiful Flat name 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Beutiful Flat name </h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 261 Hospital Street, Birmingham, undefined B19 2YG</p>\n          <p><strong>Price:</strong> $1200/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:01:18.91652	sent
41	30	14	admin_alert	🏠 New Property Submission: Beutiful Flat name 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Beutiful Flat name </h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 261 Hospital Street, Birmingham, undefined B19 2YG</p>\n          <p><strong>Price:</strong> $1200/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 8:01:18 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:01:20.195549	sent
42	30	15	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $780.00/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:13:28.34331	sent
43	30	15	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $780.00/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 8:13:28 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:13:29.714294	sent
44	30	16	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $1800/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:30:58.569705	sent
45	30	16	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $1800/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 8:30:58 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:31:01.761429	sent
46	30	17	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $780/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:38:27.984938	sent
47	30	17	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $780/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 8:38:27 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 20:38:29.948657	sent
48	30	18	submission_confirm	Property Submission Confirmed - flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $2300.00/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:00:56.555747	sent
49	30	18	admin_alert	🏠 New Property Submission: flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, westmidland B19 2YF</p>\n          <p><strong>Price:</strong> $2300.00/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 9:00:56 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:00:57.88155	sent
50	30	19	submission_confirm	Property Submission Confirmed - Flat 2	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Flat 2</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $2800.00/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:15:33.668416	sent
51	30	19	admin_alert	🏠 New Property Submission: Flat 2	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">Flat 2</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $2800.00/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 9:15:33 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:15:34.85725	sent
52	30	20	submission_confirm	Property Submission Confirmed - flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $30022.00/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:31:52.048098	sent
53	30	20	admin_alert	🏠 New Property Submission: flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $30022.00/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 9:31:52 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:31:53.35118	sent
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.properties (id, user_id, title, description, property_type, property_category, address_line1, address_line2, city, state, zip_code, country, bedrooms, bathrooms, square_feet, lot_size, year_built, price, monthly_rent, lease_term, deposit_amount, parking_spaces, has_garage, has_pool, has_garden, furnished, pets_allowed, status, featured, availability_date, contact_name, contact_phone, contact_email, slug, meta_keywords, created_at, updated_at, approved_at, approved_by, student_housing, short_description, weekly_rent) FROM stdin;
2	30	Beautiful Family Home	Spacious 3-bedroom house perfect for families	sale	\N	123 Maple Street	\N	San Francisco	CA	94102	USA	3	2.0	1800	\N	\N	750000.00	\N	\N	\N	0	f	f	f	f	f	approved	f	\N	Fatemeh Rahimi	555-0123	fa.rahimi5475@gmail.com	beautiful-family-home-1749164608651	\N	2025-06-06 00:03:28.650827	2025-06-06 00:10:41.71341	2025-06-06 00:10:41.71341	1	f	\N	\N
5	30	kkk	Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi nisl massa, interdum non mi nec, molestie ullamcorper mauris.	lease	\N	301 Appartment,86 Old Snow Hill	\N	Birmingham	\N	B 46GE	UK	\N	\N	98	7.00	\N	\N	5.00	4	3.00	26	f	f	f	f	f	rejected	f	\N	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	kkk-1749509253028	\N	2025-06-09 23:47:33.024011	2025-06-09 23:56:19.553643	2025-06-09 23:56:19.553643	1	f	\N	\N
3	30	hhhh	Use precise geolocation data. Actively scan device characteristics for identification. Store and/or access information on a device. Personalised advertising and content, advertising and content measurement, audience research and services development.	sale	commercial	301 Appartment,86 Old Snow Hill, 86old Snow Hill	\N	Birmingham	\N	B 46GE	USA	1	1.0	8	\N	1	5000.00	\N	\N	8000.00	1	t	f	t	f	f	rejected	f	\N	\N	07385777433	\N	hhhh-1749464236129	\N	2025-06-09 11:17:16.128928	2025-06-09 12:22:55.173586	2025-06-09 12:22:55.173586	1	f	\N	\N
7	30	2 flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	301 Appartment,86 Old Snow Hill, 86old Snow Hill	\N	Birmingham	westmidland	B 46GE	UK	1	1.0	\N	\N	\N	\N	2000.00	6	2343.00	0	f	f	f	t	f	approved	f	2025-07-01	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	2-flat-1749667746961	\N	2025-06-11 19:49:06.957667	2025-06-11 19:56:58.235734	2025-06-11 19:56:58.235734	1	f	\N	\N
6	30	2 bed flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	Old Road Campus	\N	Oxford	\N	OX37LF	UK	1	3.0	\N	\N	\N	\N	3000.00	12	6000.00	0	f	f	f	f	t	approved	f	2025-07-03	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	2-bed-flat-1749666820488	\N	2025-06-11 19:33:40.444403	2025-06-11 19:57:03.305569	2025-06-11 19:57:03.305569	1	f	\N	\N
20	30	flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	30022.00	12	231.00	0	f	f	t	f	f	pending	f	2025-06-15	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	flat-1749760310803	\N	2025-06-12 21:31:50.802694	2025-06-12 21:31:50.802694	\N	\N	f	Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmi	\N
4	30	dad	Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi nisl massa, interdum non mi nec, molestie ullamcorper mauris.	lease	\N	301 Appartment,86 Old Snow Hill, 86old Snow Hill	\N	Birmingham	\N	B 46GE	UK	\N	\N	98	11.00	\N	\N	2.00	1	200.00	23	f	f	f	f	f	approved	f	\N	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	dad-1749508500417	\N	2025-06-09 23:35:00.411985	2025-06-09 23:55:53.231192	2025-06-09 23:55:53.231192	1	f	\N	\N
19	30	Flat 2	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	2	2.0	\N	\N	\N	\N	2800.00	12	2900.00	1	f	f	f	f	f	pending	f	2025-06-23	Fatemeh Rahimi	07385777432	fa.rahimi5475@gmail.com	flat-2-1749759332244	\N	2025-06-12 21:15:32.243758	2025-06-12 21:15:32.243758	\N	\N	f	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fu	\N
8	30	2 bed flat	7-bedroom student accommodation\r\nCheck out the individual rooms available in this 7-bedroom student accommodation in Selly Oak! 203 Hubert Road offers the perfect location for students, with its position just over a 5-minute walk from Selly Oak Station. The University of Birmingham and amenities such as Aldi are also located within a 15-minute walking radius.\r\n\r\nThree spacious individual bedrooms are still currently available in this property – Bedrooms 2, 4 and 7.\r\n\r\nEach one is priced at £90 per person per week for the 2025-2026 academic year. To secure one, students must also pay a deposit fee of £390 per person.\r\n\r\nBills are not included in the rental price of this property, however, HOUSR bills packages can be acquired for an additional cost. These are subject to their terms and conditions, and for more information, please click HERE.\r\n\r\nCouncil Tax: Band B (students do not pay this).\r\n\r\nThis expansive 7-bed 2-bath home showcases an open-plan kitchen and lounge area equipped with a dishwasher, a communal television, two sofas, and dining table and chair set, ensuring easy daily living.\r\n\r\nEach bedroom meanwhile is large and consists of a double bed, a chest of drawers, a desk area, and a cupboard.\r\n\r\nThe house also boasts a well-maintained garden, ideal for outdoor activities and enjoying the fresh air.\r\n\r\nDon’t miss out on this fantastic property! Contact our student accommodation agents in Birmingham now or enquire online to book your viewing while it’s still available!\r\n\r\nProperty ID: M-PS441	rent	\N	266 Hospital Street	\N	Birmingham	westmidland	B19 2YF	UK	1	1.0	\N	\N	\N	\N	4000.00	6	5000.00	1	f	f	f	f	t	pending	f	2025-06-13	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	2-bed-flat-1749675208654	\N	2025-06-11 21:53:28.649711	2025-06-11 21:53:28.649711	\N	\N	f	\N	\N
9	30	central	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	UK	1	2.0	\N	\N	\N	\N	230.00	18	2000.00	0	f	f	t	f	t	pending	f	2025-06-25	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	central-1749683108760	\N	2025-06-12 00:05:08.757773	2025-06-12 00:05:08.757773	\N	\N	t	Students will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides amp	\N
10	30	1 bed 	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	222 Hospital Street	\N	Birmingham	\N	B19 2gz	United Kingdom	10	10.0	\N	\N	\N	\N	1300.00	12	2900.00	1	f	f	t	f	t	pending	f	2025-06-24	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	1-bed--1749731394257	\N	2025-06-12 13:29:54.253482	2025-06-12 13:29:54.253482	\N	\N	f	This meticulously designed student accommodation harmoniously blends space, comfort, and convenience.	\N
11	30	2 bed falat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	3.00	12	1.00	1	f	f	t	f	f	pending	f	2025-06-14	Fatemeh Rahimi	07385777432	fa.rahimi5475@gmail.com	2-bed-falat-1749748491906	\N	2025-06-12 18:14:51.90297	2025-06-12 18:14:51.90297	\N	\N	f	Don’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options	\N
12	30	modern 2 flat in central landon	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	279 Hospital Street	\N	Birmingham	\N	b154fu	United Kingdom	1	2.0	\N	\N	\N	\N	1000.00	12	1500.00	1	f	f	f	f	f	pending	f	2025-07-08	Fatemeh Rahimi	07385777212	fa.rahimi5475@gmail.com	modern-2-flat-in-central-landon-1749748794215	\N	2025-06-12 18:19:54.214457	2025-06-12 18:19:54.214457	\N	\N	t	This meticulously designed student accommodation harmoniously blends space	\N
13	30	the beutiful 2 flat 	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2CF	United Kingdom	2	3.0	\N	\N	\N	\N	879.00	24	2000.00	1	f	f	f	t	f	pending	f	2025-06-30	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	the-beutiful-2-flat--1749749894787	\N	2025-06-12 18:38:14.786059	2025-06-12 18:38:14.786059	\N	\N	f	With its unbeatable location and well-appointed amenities	\N
14	30	Beutiful Flat name 	With its unbeatable location and well-appointed amenities	rent	\N	261 Hospital Street	\N	Birmingham	\N	B19 2YG	United Kingdom	1	1.0	\N	\N	\N	\N	1200.00	24	1300.00	0	f	f	t	t	f	pending	f	2025-06-29	Fatemeh Rahimi	07385777431	fa.rahimi5475@gmail.com	beutiful-flat-name--1749754877343	\N	2025-06-12 20:01:17.342711	2025-06-12 20:01:17.342711	\N	\N	f	With its unbeatable location and well-appointed amenities	\N
15	30	ddd	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	780.00	12	18.00	1	f	f	f	f	f	pending	f	2025-07-02	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	ddd-1749755605527	\N	2025-06-12 20:13:25.526802	2025-06-12 20:13:25.526802	\N	\N	f	Don’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	\N
16	30	ddd	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	westmidland	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	1800.00	12	1.00	0	f	f	f	t	f	pending	f	2025-06-17	Fatemeh Rahimi	07385777400	fa.rahimi5475@gmail.com	ddd-1749756656748	\N	2025-06-12 20:30:56.747663	2025-06-12 20:30:56.747663	\N	\N	f	\r\nDon’t miss out on this incredible 	\N
17	30	ddd	🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00\r\nPropertyCard.js:11 🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00\r\nPropertyCard.js:11 🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	4.0	\N	\N	\N	\N	780.00	24	4500.00	1	f	f	f	f	f	pending	f	2025-07-07	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	ddd-1749757105571	\N	2025-06-12 20:38:25.570427	2025-06-12 20:38:25.570427	\N	\N	f	🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\n	\N
18	30	flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	westmidland	B19 2YF	United Kingdom	2	3.0	\N	\N	\N	\N	2300.00	18	2320.00	1	f	f	f	f	t	pending	f	2025-06-30	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	flat-1749758455179	\N	2025-06-12 21:00:55.17767	2025-06-12 21:00:55.17767	\N	\N	t	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. 	\N
\.


--
-- Data for Name: property_amenities; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.property_amenities (id, property_id, amenity_name, amenity_category, created_at) FROM stdin;
\.


--
-- Data for Name: property_images; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.property_images (id, property_id, image_url, image_type, image_order, alt_text, created_at) FROM stdin;
1	4	/uploads/4_0_istockphoto-1006507940-612x612.jpg	image	0	dad	2025-06-09 23:35:00.411985
2	4	/uploads/4_1_download.jpeg	image	1	dad	2025-06-09 23:35:00.411985
3	6	/uploads/6_0_download.jpeg	image	0	2 bed flat	2025-06-11 19:33:40.444403
4	6	/uploads/6_1_hero-image.jpg	image	1	2 bed flat	2025-06-11 19:33:40.444403
5	6	/uploads/6_2_istockphoto-1006507940-612x612.jpg	image	2	2 bed flat	2025-06-11 19:33:40.444403
6	6	/uploads/6_3_looking-modern-highrise-office-buildings-260nw-2474144379.webp	image	3	2 bed flat	2025-06-11 19:33:40.444403
7	6	/uploads/6_4_background2.mp4	video	4	2 bed flat	2025-06-11 19:33:40.444403
8	6	/uploads/6_5_background.mp4	video	5	2 bed flat	2025-06-11 19:33:40.444403
9	6	/uploads/6_6_13317064_3840_2160_60fps.mp4	video	6	2 bed flat	2025-06-11 19:33:40.444403
10	7	/uploads/7_0_hero-image.jpg	image	0	2 flat	2025-06-11 19:49:06.957667
11	7	/uploads/7_1_7817154-hd_1080_1920_25fps.mp4	video	1	2 flat	2025-06-11 19:49:06.957667
12	7	/uploads/7_2_13317064_3840_2160_60fps.mp4	video	2	2 flat	2025-06-11 19:49:06.957667
13	7	/uploads/7_3_istockphoto-1006507940-612x612.jpg	image	3	2 flat	2025-06-11 19:49:06.957667
14	8	/uploads/8_0_background2.mp4	video	0	2 bed flat	2025-06-11 21:53:28.649711
15	8	/uploads/8_1_background.mp4	video	1	2 bed flat	2025-06-11 21:53:28.649711
16	8	/uploads/8_2_looking-modern-highrise-office-buildings-260nw-2474144379.webp	image	2	2 bed flat	2025-06-11 21:53:28.649711
17	8	/uploads/8_3_istockphoto-1006507940-612x612.jpg	image	3	2 bed flat	2025-06-11 21:53:28.649711
18	8	/uploads/8_4_hero-image.jpg	image	4	2 bed flat	2025-06-11 21:53:28.649711
19	9	/uploads/9_0_pexels-binyaminmellish-1396122.jpg	image	0	central	2025-06-12 00:05:08.757773
20	9	/uploads/9_1_pexels-camila-melo-1602181-3075974.jpg	image	1	central	2025-06-12 00:05:08.757773
21	9	/uploads/9_2_bg7.jpg	image	2	central	2025-06-12 00:05:08.757773
22	9	/uploads/9_3_bg5.jpg	image	3	central	2025-06-12 00:05:08.757773
23	9	/uploads/9_4_bg-9.jpg	image	4	central	2025-06-12 00:05:08.757773
24	10	/uploads/10_0_bg-3.jpg	image	0	1 bed 	2025-06-12 13:29:54.253482
25	10	/uploads/10_1_bg-4.jpg	image	1	1 bed 	2025-06-12 13:29:54.253482
26	10	/uploads/10_2_bg-6.jpg	image	2	1 bed 	2025-06-12 13:29:54.253482
27	10	/uploads/10_3_bg-5.jpg	image	3	1 bed 	2025-06-12 13:29:54.253482
28	10	/uploads/10_4_bg-7.jpg	image	4	1 bed 	2025-06-12 13:29:54.253482
29	10	/uploads/10_5_bg-8.jpg	image	5	1 bed 	2025-06-12 13:29:54.253482
30	11	/uploads/11_0_pexels-lina-3639542.jpg	image	0	2 bed falat	2025-06-12 18:14:51.90297
31	11	/uploads/11_1_pexels-imphoto-32870.jpg	image	1	2 bed falat	2025-06-12 18:14:51.90297
32	11	/uploads/11_2_pexels-ingo-87378.jpg	image	2	2 bed falat	2025-06-12 18:14:51.90297
33	11	/uploads/11_3_pexels-hikaique-65438.jpg	image	3	2 bed falat	2025-06-12 18:14:51.90297
34	11	/uploads/11_4_pexels-heyho-6238614.jpg	image	4	2 bed falat	2025-06-12 18:14:51.90297
35	11	/uploads/11_5_pexels-heyho-8134850.jpg	image	5	2 bed falat	2025-06-12 18:14:51.90297
36	11	/uploads/11_6_pexels-frans-van-heerden-201846-1438834.jpg	image	6	2 bed falat	2025-06-12 18:14:51.90297
37	12	/uploads/12_0_pexels-pixabay-259588 (1).jpg	image	0	modern 2 flat in central landon	2025-06-12 18:19:54.214457
38	12	/uploads/12_1_pexels-imphoto-32870.jpg	image	1	modern 2 flat in central landon	2025-06-12 18:19:54.214457
39	12	/uploads/12_2_pexels-lina-3639542.jpg	image	2	modern 2 flat in central landon	2025-06-12 18:19:54.214457
40	12	/uploads/12_3_pexels-scottwebb-1029599.jpg	image	3	modern 2 flat in central landon	2025-06-12 18:19:54.214457
41	12	/uploads/12_4_pexels-pixabay-534124.jpg	image	4	modern 2 flat in central landon	2025-06-12 18:19:54.214457
42	12	/uploads/12_5_pexels-pixabay-280222 (1).jpg	image	5	modern 2 flat in central landon	2025-06-12 18:19:54.214457
43	12	/uploads/12_6_pexels-pixabay-273244.jpg	image	6	modern 2 flat in central landon	2025-06-12 18:19:54.214457
44	13	/uploads/13_0_pexels-pixabay-259588 (1).jpg	image	0	the beutiful 2 flat 	2025-06-12 18:38:14.786059
45	13	/uploads/13_1_bg-2.jpg	image	1	the beutiful 2 flat 	2025-06-12 18:38:14.786059
46	13	/uploads/13_2_pexels-heyho-6238614.jpg	image	2	the beutiful 2 flat 	2025-06-12 18:38:14.786059
47	14	/uploads/14_0_bg-9.jpg	image	0	Beutiful Flat name 	2025-06-12 20:01:17.342711
48	14	/uploads/14_1_bg-7.jpg	image	1	Beutiful Flat name 	2025-06-12 20:01:17.342711
49	14	/uploads/14_2_bg-6.jpg	image	2	Beutiful Flat name 	2025-06-12 20:01:17.342711
50	14	/uploads/14_3_bg-47.jpg	image	3	Beutiful Flat name 	2025-06-12 20:01:17.342711
51	15	/uploads/15_0_bg-4.jpg	image	0	ddd	2025-06-12 20:13:25.526802
52	15	/uploads/15_1_bg-7.jpg	image	1	ddd	2025-06-12 20:13:25.526802
53	15	/uploads/15_2_bg-9.jpg	image	2	ddd	2025-06-12 20:13:25.526802
54	15	/uploads/15_3_bg-8.jpg	image	3	ddd	2025-06-12 20:13:25.526802
55	16	/uploads/16_0_pexels-camila-melo-1602181-3075974.jpg	image	0	ddd	2025-06-12 20:30:56.747663
56	16	/uploads/16_1_pexels-binyaminmellish-1396122.jpg	image	1	ddd	2025-06-12 20:30:56.747663
57	16	/uploads/16_2_pexels-a-darmel-7641857.jpg	image	2	ddd	2025-06-12 20:30:56.747663
58	16	/uploads/16_3_8482334-hd_1920_1080_25fps.mp4	video	3	ddd	2025-06-12 20:30:56.747663
59	17	/uploads/17_0_bg-1.jpg	image	0	ddd	2025-06-12 20:38:25.570427
60	17	/uploads/17_1_bg-2.jpg	image	1	ddd	2025-06-12 20:38:25.570427
61	17	/uploads/17_2_bg-3.jpg	image	2	ddd	2025-06-12 20:38:25.570427
62	18	/uploads/18_0_bg-7.jpg	image	0	flat	2025-06-12 21:00:55.17767
63	19	/uploads/19_0_bg-9.jpg	image	0	Flat 2	2025-06-12 21:15:32.243758
64	19	/uploads/19_1_bg-8.jpg	image	1	Flat 2	2025-06-12 21:15:32.243758
65	19	/uploads/19_2_bg-7.jpg	image	2	Flat 2	2025-06-12 21:15:32.243758
66	19	/uploads/19_3_bg-6.jpg	image	3	Flat 2	2025-06-12 21:15:32.243758
67	20	/uploads/20_0_bg-5.jpg	image	0	flat	2025-06-12 21:31:50.802694
\.


--
-- Data for Name: property_submissions; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.property_submissions (id, property_id, user_id, submission_type, admin_notes, rejection_reason, reviewed_by, reviewed_at, created_at) FROM stdin;
1	2	30	new	\N	\N	\N	\N	2025-06-06 00:03:28.650827
3	2	30	review	Great property listing! Approved for publication.	\N	1	2025-06-06 00:10:41.716669	2025-06-06 00:10:41.716669
4	3	30	new	\N	\N	\N	\N	2025-06-09 11:17:16.128928
5	3	30	review			1	2025-06-09 11:34:41.750317	2025-06-09 11:34:41.750317
6	3	30	review			1	2025-06-09 11:34:42.762629	2025-06-09 11:34:42.762629
7	3	30	review	Use precise geolocation data. Actively scan device characteristics for identification. Store and/or access information on a device. Personalised advertising and content, advertising and content measurement, audience research and services development.		1	2025-06-09 12:21:10.282478	2025-06-09 12:21:10.282478
8	3	30	review	bbbb	bbbb	1	2025-06-09 12:22:54.199688	2025-06-09 12:22:54.199688
9	3	30	review	bbbb	bbbb	1	2025-06-09 12:22:55.175005	2025-06-09 12:22:55.175005
10	4	30	new	\N	\N	\N	\N	2025-06-09 23:35:00.411985
11	5	30	new	\N	\N	\N	\N	2025-06-09 23:47:33.024011
12	5	30	review	GOHHHHHH	GOHHHH TOOOSH	1	2025-06-09 23:52:22.906954	2025-06-09 23:52:22.906954
13	5	30	review	GOHHHHHH	GOHHHH TOOOSH	1	2025-06-09 23:52:24.793477	2025-06-09 23:52:24.793477
14	5	30	review	GOHHHHHH	GOHHHH TOOOSH	1	2025-06-09 23:52:25.599692	2025-06-09 23:52:25.599692
15	5	30	review	GOHHHHHH	GOHHHH TOOOSH	1	2025-06-09 23:52:25.854786	2025-06-09 23:52:25.854786
16	5	30	review	GOHHHHHH	GOHHHH TOOOSH	1	2025-06-09 23:52:26.09444	2025-06-09 23:52:26.09444
17	4	30	review	\N	\N	1	2025-06-09 23:55:53.234857	2025-06-09 23:55:53.234857
18	5	30	review	jjjj	jjjjjjj	1	2025-06-09 23:56:19.55702	2025-06-09 23:56:19.55702
19	6	30	new	\N	\N	\N	\N	2025-06-11 19:33:40.444403
20	7	30	new	\N	\N	\N	\N	2025-06-11 19:49:06.957667
21	7	30	review	\N	\N	1	2025-06-11 19:56:58.240263	2025-06-11 19:56:58.240263
22	6	30	review	\N	\N	1	2025-06-11 19:57:03.307868	2025-06-11 19:57:03.307868
23	8	30	new	\N	\N	\N	\N	2025-06-11 21:53:28.649711
24	9	30	new	\N	\N	\N	\N	2025-06-12 00:05:08.757773
25	10	30	new	\N	\N	\N	\N	2025-06-12 13:29:54.253482
26	11	30	new	\N	\N	\N	\N	2025-06-12 18:14:51.90297
27	12	30	new	\N	\N	\N	\N	2025-06-12 18:19:54.214457
28	13	30	new	\N	\N	\N	\N	2025-06-12 18:38:14.786059
29	14	30	new	\N	\N	\N	\N	2025-06-12 20:01:17.342711
30	15	30	new	\N	\N	\N	\N	2025-06-12 20:13:25.526802
31	16	30	new	\N	\N	\N	\N	2025-06-12 20:30:56.747663
32	17	30	new	\N	\N	\N	\N	2025-06-12 20:38:25.570427
33	18	30	new	\N	\N	\N	\N	2025-06-12 21:00:55.17767
34	19	30	new	\N	\N	\N	\N	2025-06-12 21:15:32.243758
35	20	30	new	\N	\N	\N	\N	2025-06-12 21:31:50.802694
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.users (id, email, password, first_name, last_name, google_id, created_at, updated_at, picture, is_verified, reset_token, reset_token_expiry, role, phone) FROM stdin;
31	test@example.com	\N	Test	User	\N	2025-06-05 23:33:02.629718	2025-06-05 23:33:02.629718	\N	f	\N	\N	user	\N
32	admin@property.com	$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi	Admin	User	\N	2025-06-05 23:33:02.63194	2025-06-05 23:33:02.63194	\N	t	\N	\N	admin	\N
29	shahrzadrahy@gmail.com	$2a$10$KnlW1D8I3V7okpARte8nku7N.7KUIoF4Ea3uBzE7g.RtvgS9S8z7O	SHAHRZAD	RAHIMI	102682520512212166024	2025-06-03 13:00:32.098063	2025-06-12 12:06:03.238763	https://lh3.googleusercontent.com/a/ACg8ocJidz-393UeVq0v4aNCZlw-Zlhp7HH6rwhdaoldwpQ7K9c2bmw=s96-c	t	\N	\N	user	\N
30	fa.rahimi5475@gmail.com	$2a$10$iGTq/vWqqrWi33Lr1VfKeerWBI60oLlShyCGcqOd3oLsW1aIHvHZy	Fatemeh	Rahimi	105426167604603741023	2025-06-03 13:01:22.443846	2025-06-12 19:59:26.823591	https://lh3.googleusercontent.com/a/ACg8ocKDGOgwNGQKtyptaWyfpZbonCXEChKr-SZtILMljvpMMLuxKPE=s96-c	t	\N	\N	user	+447398593360
33	profiletest@example.com	$2a$10$EVG2BTKN2OUiKZdsO.pCluzFANNDq1Rhorl5lkKIpw9AXcGPTtvjq	Updated	TestUser	\N	2025-06-10 22:52:37.630605	2025-06-10 22:52:37.668044	\N	t	\N	\N	user	+1 (555) 777-8888
\.


--
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.admins_id_seq', 5, true);


--
-- Name: email_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.email_notifications_id_seq', 53, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.properties_id_seq', 20, true);


--
-- Name: property_amenities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_amenities_id_seq', 1, false);


--
-- Name: property_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_images_id_seq', 67, true);


--
-- Name: property_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_submissions_id_seq', 35, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.users_id_seq', 33, true);


--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: email_notifications email_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.email_notifications
    ADD CONSTRAINT email_notifications_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: properties properties_slug_key; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_slug_key UNIQUE (slug);


--
-- Name: property_amenities property_amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_pkey PRIMARY KEY (id);


--
-- Name: property_images property_images_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_pkey PRIMARY KEY (id);


--
-- Name: property_submissions property_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_submissions
    ADD CONSTRAINT property_submissions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_properties_created_at; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_properties_created_at ON public.properties USING btree (created_at);


--
-- Name: idx_properties_status; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_properties_status ON public.properties USING btree (status);


--
-- Name: idx_properties_type; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_properties_type ON public.properties USING btree (property_type);


--
-- Name: idx_properties_user_id; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_properties_user_id ON public.properties USING btree (user_id);


--
-- Name: idx_property_amenities_property_id; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_property_amenities_property_id ON public.property_amenities USING btree (property_id);


--
-- Name: idx_property_images_property_id; Type: INDEX; Schema: public; Owner: fatemehrahimi
--

CREATE INDEX idx_property_images_property_id ON public.property_images USING btree (property_id);


--
-- Name: email_notifications email_notifications_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.email_notifications
    ADD CONSTRAINT email_notifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: email_notifications email_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.email_notifications
    ADD CONSTRAINT email_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: properties properties_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id);


--
-- Name: properties properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: property_amenities property_amenities_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_images property_images_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_submissions property_submissions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_submissions
    ADD CONSTRAINT property_submissions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_submissions property_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_submissions
    ADD CONSTRAINT property_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admins(id);


--
-- Name: property_submissions property_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fatemehrahimi
--

ALTER TABLE ONLY public.property_submissions
    ADD CONSTRAINT property_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

