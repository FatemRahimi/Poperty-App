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
1	fa.rahimi5475@gmail.com	$2a$10$0rrFKuTf7gMx3oq1UC7/MeQ2SOR6uM.t8znsJQLQCW16RnmJuetZq	Shahrzad	Rahimi	super_admin	t	2025-06-18 02:15:27.868122	2025-06-05 15:54:11.950498	2025-06-05 15:54:11.950498	2025-06-05 15:54:11.950498
\.


--
-- Data for Name: email_notifications; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.email_notifications (id, user_id, property_id, notification_type, email_subject, email_body, sent_to, sent_at, status) FROM stdin;
11	30	4	submission_confirm	Property Submission Confirmed - dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">dad</h3>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $2/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/9/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:35:02.554606	sent
12	30	4	admin_alert	🏠 New Property Submission: dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">dad</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Lease</p>\n          <p><strong>Address:</strong> 301 Appartment,86 Old Snow Hill, 86old Snow Hill, Birmingham, undefined B 46GE</p>\n          <p><strong>Price:</strong> $2/month</p>\n          <p><strong>Submitted:</strong> 6/9/2025, 11:35:02 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:35:04.995782	sent
20	30	4	approval	🎉 Property Approved: dad	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">dad</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/9/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/dad-1749508500417" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-09 23:55:54.556615	sent
32	30	10	submission_confirm	Property Submission Confirmed - 1 bed 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">1 bed </h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 222 Hospital Street, Birmingham, undefined B19 2gz</p>\n          <p><strong>Price:</strong> $1300/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 13:29:56.135727	sent
33	30	10	admin_alert	🏠 New Property Submission: 1 bed 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">1 bed </h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 222 Hospital Street, Birmingham, undefined B19 2gz</p>\n          <p><strong>Price:</strong> $1300/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 1:29:56 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 13:29:57.733857	sent
34	30	11	submission_confirm	Property Submission Confirmed - 2 bed falat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed falat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:14:53.613703	sent
35	30	11	admin_alert	🏠 New Property Submission: 2 bed falat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 bed falat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 6:14:53 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 18:14:54.981512	sent
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
54	30	21	submission_confirm	Property Submission Confirmed - 2-Bed Flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2-Bed Flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 262 Hospital Street, Birmingham, undefined B19 2YG</p>\n          <p><strong>Price:</strong> $8000.00/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/12/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:58:59.432473	sent
55	30	21	admin_alert	🏠 New Property Submission: 2-Bed Flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2-Bed Flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 262 Hospital Street, Birmingham, undefined B19 2YG</p>\n          <p><strong>Price:</strong> $8000.00/month</p>\n          <p><strong>Submitted:</strong> 6/12/2025, 9:58:59 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 21:59:01.385716	sent
58	30	20	approval	🎉 Property Approved: flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Great news! Your property listing has been approved and is now live on our platform.</p>\n        \n        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">\n          <h3 style="color: #155724; margin-top: 0;">flat</h3>\n          <p><strong>Status:</strong> ✅ Approved & Live</p>\n          <p><strong>Approved on:</strong> 6/12/2025</p>\n          \n        </div>\n        \n        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/property/flat-1749760310803" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 23:27:07.624014	sent
60	30	21	rejection	📝 Property Review Required: 2-Bed Flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Your property listing requires some updates before it can be approved.</p>\n        \n        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">\n          <h3 style="color: #721c24; margin-top: 0;">2-Bed Flat</h3>\n          <p><strong>Status:</strong> ❌ Needs Review</p>\n          <p><strong>Reviewed on:</strong> 6/12/2025</p>\n          \n          \n        </div>\n        \n        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-12 23:27:22.056476	sent
61	30	23	submission_confirm	Property Submission Confirmed - 2 Bed Flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 Bed Flat</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3,000/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/13/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-13 02:56:01.898121	sent
62	30	23	admin_alert	🏠 New Property Submission: 2 Bed Flat	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">2 Bed Flat</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3,000/month</p>\n          <p><strong>Submitted:</strong> 6/13/2025, 2:56:01 AM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-13 02:56:04.54041	sent
63	30	24	submission_confirm	Property Submission Confirmed - 3 attached	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">3 attached</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/13/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-13 21:58:54.217239	sent
64	30	24	admin_alert	🏠 New Property Submission: 3 attached	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">3 attached</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Submitted:</strong> 6/13/2025, 9:58:54 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-13 21:58:55.835924	sent
65	30	25	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 clarmont, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/16/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 13:16:58.409603	sent
66	30	25	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 clarmont, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $3/month</p>\n          <p><strong>Submitted:</strong> 6/16/2025, 1:16:58 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 13:16:59.709528	sent
67	30	26	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 alfered, Birmingham, westmidland B19 2ge</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/16/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 13:36:26.405301	sent
68	30	26	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 alfered, Birmingham, westmidland B19 2ge</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Submitted:</strong> 6/16/2025, 1:36:26 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 13:36:27.701814	sent
71	30	28	submission_confirm	Property Submission Confirmed - 3 bed falt 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">3 bed falt </h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 234 Hospital Street, Birmingham, undefined B19 2eg</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/16/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 20:52:33.481546	sent
72	30	28	admin_alert	🏠 New Property Submission: 3 bed falt 	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">3 bed falt </h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 234 Hospital Street, Birmingham, undefined B19 2eg</p>\n          <p><strong>Price:</strong> $1,200/month</p>\n          <p><strong>Submitted:</strong> 6/16/2025, 8:52:33 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 20:52:34.680525	sent
73	30	29	submission_confirm	Property Submission Confirmed - ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>\n        <p>Dear Fatemeh Rahimi,</p>\n        <p>Thank you for submitting your property listing. Here are the details:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street-clarmot street- dallingo avenu, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $600/month</p>\n          <p><strong>Status:</strong> Pending Review</p>\n          <p><strong>Submitted:</strong> 6/16/2025</p>\n        </div>\n        \n        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>\n        <p>You can track your submission status in your dashboard at any time.</p>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>\n        </div>\n        \n        <p>Best regards,<br>Property Management Team</p>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 20:55:36.850354	sent
74	30	29	admin_alert	🏠 New Property Submission: ddd	\n      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>\n        <p>A new property has been submitted and requires review:</p>\n        \n        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">\n          <h3 style="color: #667eea; margin-top: 0;">ddd</h3>\n          <p><strong>Submitted by:</strong> Fatemeh Rahimi (fa.rahimi5475@gmail.com)</p>\n          <p><strong>Type:</strong> Rent</p>\n          <p><strong>Address:</strong> 266 Hospital Street-clarmot street- dallingo avenu, Birmingham, undefined B19 2YF</p>\n          <p><strong>Price:</strong> $600/month</p>\n          <p><strong>Submitted:</strong> 6/16/2025, 8:55:36 PM</p>\n        </div>\n        \n        <div style="text-align: center; margin: 30px 0;">\n          <a href="http://localhost:3000/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>\n        </div>\n      </div>\n    	fa.rahimi5475@gmail.com	2025-06-16 20:55:40.35166	sent
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.properties (id, user_id, title, description, property_type, property_category, address_line1, address_line2, city, state, zip_code, country, bedrooms, bathrooms, square_feet, lot_size, year_built, price, monthly_rent, lease_term, deposit_amount, parking_spaces, has_garage, has_pool, has_garden, furnished, pets_allowed, status, featured, availability_date, contact_name, contact_phone, contact_email, slug, meta_keywords, created_at, updated_at, approved_at, approved_by, student_housing, short_description, weekly_rent) FROM stdin;
18	30	flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	westmidland	B19 2YF	United Kingdom	2	3.0	\N	\N	\N	\N	2300.00	18	2320.00	1	f	f	f	f	t	pending	f	2025-06-30	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	flat-1749758455179	\N	2025-06-12 21:00:55.17767	2025-06-12 21:00:55.17767	\N	\N	t	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. 	\N
4	30	dad	Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi nisl massa, interdum non mi nec, molestie ullamcorper mauris.	lease	\N	301 Appartment,86 Old Snow Hill, 86old Snow Hill	\N	Birmingham	\N	B 46GE	UK	\N	\N	98	11.00	\N	\N	2.00	1	200.00	23	f	f	f	f	f	approved	f	\N	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	dad-1749508500417	\N	2025-06-09 23:35:00.411985	2025-06-09 23:55:53.231192	2025-06-09 23:55:53.231192	1	f	\N	\N
10	30	1 bed 	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	222 Hospital Street	\N	Birmingham	\N	B19 2gz	United Kingdom	10	10.0	\N	\N	\N	\N	1300.00	12	2900.00	1	f	f	t	f	t	pending	f	2025-06-24	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	1-bed--1749731394257	\N	2025-06-12 13:29:54.253482	2025-06-12 13:29:54.253482	\N	\N	f	This meticulously designed student accommodation harmoniously blends space, comfort, and convenience.	\N
11	30	2 bed falat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	3.00	12	1.00	1	f	f	t	f	f	pending	f	2025-06-14	Fatemeh Rahimi	07385777432	fa.rahimi5475@gmail.com	2-bed-falat-1749748491906	\N	2025-06-12 18:14:51.90297	2025-06-12 18:14:51.90297	\N	\N	f	Don’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options	\N
13	30	the beutiful 2 flat 	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2CF	United Kingdom	2	3.0	\N	\N	\N	\N	879.00	24	2000.00	1	f	f	f	t	f	pending	f	2025-06-30	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	the-beutiful-2-flat--1749749894787	\N	2025-06-12 18:38:14.786059	2025-06-12 18:38:14.786059	\N	\N	f	With its unbeatable location and well-appointed amenities	\N
14	30	Beutiful Flat name 	With its unbeatable location and well-appointed amenities	rent	\N	261 Hospital Street	\N	Birmingham	\N	B19 2YG	United Kingdom	1	1.0	\N	\N	\N	\N	1200.00	24	1300.00	0	f	f	t	t	f	pending	f	2025-06-29	Fatemeh Rahimi	07385777431	fa.rahimi5475@gmail.com	beutiful-flat-name--1749754877343	\N	2025-06-12 20:01:17.342711	2025-06-12 20:01:17.342711	\N	\N	f	With its unbeatable location and well-appointed amenities	\N
15	30	ddd	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	780.00	12	18.00	1	f	f	f	f	f	pending	f	2025-07-02	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	ddd-1749755605527	\N	2025-06-12 20:13:25.526802	2025-06-12 20:13:25.526802	\N	\N	f	Don’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	\N
16	30	ddd	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.	rent	\N	266 Hospital Street	\N	Birmingham	westmidland	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	1800.00	12	1.00	0	f	f	f	t	f	pending	f	2025-06-17	Fatemeh Rahimi	07385777400	fa.rahimi5475@gmail.com	ddd-1749756656748	\N	2025-06-12 20:30:56.747663	2025-06-12 20:30:56.747663	\N	\N	f	\r\nDon’t miss out on this incredible 	\N
19	30	Flat 2	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	2	2.0	\N	\N	\N	\N	2800.00	12	2900.00	1	f	f	f	f	f	pending	f	2025-06-23	Fatemeh Rahimi	07385777432	fa.rahimi5475@gmail.com	flat-2-1749759332244	\N	2025-06-12 21:15:32.243758	2025-06-12 21:15:32.243758	\N	\N	f	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fu	\N
28	30	3 bed falt 	THE HOME:\r\n\r\nOccupying a delightful position on Earlswood Common, Blythehurst is a beautifully presented, double-fronted Edwardian home believed to date back to circa 1906. Sympathetically extended and enhanced over nearly 30 years of ownership by the current owners, this elegant residence blends timeless character with modern comfort.\r\n\r\nSet well back from the road, the home is approached via a in-and-out tarmacadam driveway with brick edging and a central lawn front garden, framed by mature trees and hedging that provide excellent privacy from the road and neighbouring properties. A single garage with up-and-over door, a side gate to the rear garden, and a welcoming front entrance complete the frontage.\r\n\r\nUpon stepping into the home, you are welcomed by a delightful reception hallway, where the staircase rises to the first floor and an understairs cupboard provides practical storage. From here, doors lead into the main living areas, including the dining room and the living room. This warm and cosy room benefits from a bay window to the front, a charming log-burning stove set on a raised hearth with a timber beam mantel, and French doors that flow effortlessly into the kitchen, enhancing the sense of light and connectivity.\r\n\r\nThe breakfast kitchen is undoubtedly the heart of the home, bathed in natural light and thoughtfully designed for both everyday living and entertaining. It features an excellent range of base and wall units, granite worktops, and integrated appliances including a fridge, freezer, dishwasher, and a Britannia range-style cooker. French doors open directly onto the patio and rear garden, creating a lovely indoor-outdoor connection. From the kitchen, there is further access to a utility room and to the dining room. An additional reception room overlooks the rear garden and offers a versatile space, ideal as a home office, playroom or snug. The dining room, also accessed from the reception hallway, features a second bay window to the front and a charming feature fireplace, adding warmth and character to the space.\r\n\r\nThe utility room is fitted with matching base units, granite worktops and a sink unit; with space and plumbing for a washing machine. A door provides external side access and also leads through to a ground-floor shower room, which is complete with a corner shower cubicle, pedestal basin, WC, and an obscured rear-facing window.\r\n\r\nUpstairs, the first-floor landing provides access to the roof space and leads to four well-proportioned bedrooms along with the family bathroom. The principal bedroom is a spacious, dual-aspect room featuring fitted wardrobes and views across both the front and rear elevations.\r\n\r\nThe family bathroom is well equipped with a three piece suite comprising a panelled bath with shower over and glazed screen, a pedestal wash basin, WC, and a built-in airing cupboard housing the hot water cylinder. An obscured window to the front allows for natural light while maintaining privacy.\r\n\r\nThe rear garden is a particular highlight of Blythehurst. Westerly facing and beautifully landscaped, it backs directly onto the picturesque Earlswood Lakes, offering a peaceful and private outdoor retreat. A spacious block-paved patio provides an ideal entertaining area, with external power and a water tap. Beyond the patio lies a manicured lawn with shaped borders planted with a variety of mature shrubs, plants, and trees. The garden also features a Robinsons Repton greenhouse and a raised vegetable patch.\r\n\r\nA superb addition to the property is the detached cedar-clad garden office or home gym, constructed in 2010/11. This versatile building is currently used as a home office and benefits from underfloor heating, UPVC double-glazed bi-folding doors, a UPVC double-glazed window, telephone and TV points, internal power, external lighting, and a water tap. It provides the perfect space for working from home, exercising or simply relaxing.\r\n\r\nTHE LOCATION:\r\n\r\nEarlswood is situated approximately 6 miles South-East of Birmingham city centre and is known for its picturesque landscapes and natural beauty. The area features a number of green spaces and parks, including Earlswood Lakes, which is popular among anglers and walkers. The village itself is small and quiet, with a local pub, post office and convenience store. The area is well connected to local train lines, with Earlswood train station providing frequent services to destinations such as Birmingham, Stratford upon Avon, and Leamington Spa. The nearby M42 motorway also provides easy access to the cities of Birmingham and Coventry, as well as other major motorways.\r\n\r\nView payable Stamp Duty for this property	rent	\N	234 Hospital Street	\N	Birmingham	\N	B19 2eg	United Kingdom	1	2.0	\N	\N	\N	\N	1200.00	6	2000.00	1	f	f	t	t	t	pending	f	2025-06-23	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	3-bed-falt--1750103551966	\N	2025-06-16 20:52:31.965089	2025-06-16 20:52:31.965089	\N	\N	t	\N	200.00
20	30	flat	Introducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	2.0	\N	\N	\N	\N	30022.00	12	231.00	0	f	f	t	f	f	approved	f	2025-06-15	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	flat-1749760310803	\N	2025-06-12 21:31:50.802694	2025-06-12 23:27:06.100236	2025-06-12 23:27:06.100236	1	f	Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmi	\N
17	30	ddd	🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00\r\nPropertyCard.js:11 🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00\r\nPropertyCard.js:11 🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\nhook.js:377 🏠 PropertyCard Debug - Property: 16\r\nhook.js:377 Weekly Rent: undefined\r\nhook.js:377 Monthly Rent: 1800.00	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	1	4.0	\N	\N	\N	\N	780.00	24	4500.00	1	f	f	f	f	f	pending	f	2025-07-07	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	ddd-1749757105571	\N	2025-06-12 20:38:25.570427	2025-06-12 20:38:25.570427	\N	\N	f	🏠 PropertyCard Debug - Property: 16\r\nPropertyCard.js:12 Weekly Rent: undefined\r\nPropertyCard.js:13 Monthly Rent: 1800.00\r\n	\N
29	30	ddd	About this property\r\nTHE HOME:\r\n\r\nOccupying a delightful position on Earlswood Common, Blythehurst is a beautifully presented, double-fronted Edwardian home believed to date back to circa 1906. Sympathetically extended and enhanced over nearly 30 years of ownership by the current owners, this elegant residence blends timeless character with modern comfort.\r\n\r\nSet well back from the road, the home is approached via a in-and-out tarmacadam driveway with brick edging and a central lawn front garden, framed by mature trees and hedging that provide excellent privacy from the road and neighbouring properties. A single garage with up-and-over door, a side gate to the rear garden, and a welcoming front entrance complete the frontage.\r\n\r\nUpon stepping into the home, you are welcomed by a delightful reception hallway, where the staircase rises to the first floor and an understairs cupboard provides practical storage. From here, doors lead into the main living areas, including the dining room and the living room. This warm and cosy room benefits from a bay window to the front, a charming log-burning stove set on a raised hearth with a timber beam mantel, and French doors that flow effortlessly into the kitchen, enhancing the sense of light and connectivity.	rent	\N	266 Hospital Street-clarmot street- dallingo avenu	\N	Birmingham	\N	B19 2YF	United Kingdom	10	3.0	\N	\N	\N	\N	600.00	12	6000.00	0	f	f	f	f	t	pending	f	2025-06-20	Fatemeh Rahimi	07385777400	fa.rahimi5475@gmail.com	ddd-1750103734519	\N	2025-06-16 20:55:34.51863	2025-06-16 20:55:34.51863	\N	\N	f	\N	120.00
21	30	2-Bed Flat	7-bedroom student accommodation\r\nCheck out the individual rooms available in this 7-bedroom student accommodation in Selly Oak! 203 Hubert Road offers the perfect location for students, with its position just over a 5-minute walk from Selly Oak Station. The University of Birmingham and amenities such as Aldi are also located within a 15-minute walking radius.\r\n\r\nThree spacious individual bedrooms are still currently available in this property – Bedrooms 2, 4 and 7.\r\n\r\nEach one is priced at £90 per person per week for the 2025-2026 academic year. To secure one, students must also pay a deposit fee of £390 per person.\r\n\r\nBills are not included in the rental price of this property, however, HOUSR bills packages can be acquired for an additional cost. These are subject to their terms and conditions, and for more information, please click HERE.\r\n\r\nCouncil Tax: Band B (students do not pay this).\r\n\r\nThis expansive 7-bed 2-bath home showcases an open-plan kitchen and lounge area equipped with a dishwasher, a communal television, two sofas, and dining table and chair set, ensuring easy daily living.\r\n\r\nEach bedroom meanwhile is large and consists of a double bed, a chest of drawers, a desk area, and a cupboard.\r\n\r\nThe house also boasts a well-maintained garden, ideal for outdoor activities and enjoying the fresh air.\r\n\r\nDon’t miss out on this fantastic property! Contact our student accommodation agents in Birmingham now or enquire online to book your viewing while it’s still available!\r\n\r\nProperty ID: M-PS441	rent	\N	262 Hospital Street	\N	Birmingham	\N	B19 2YG	United Kingdom	\N	2.0	\N	\N	\N	\N	8000.00	6	8600.00	1	f	f	f	t	f	rejected	f	2025-06-25	Fatemeh Rahimi	07385777433	fa.rahimi5475@gmail.com	2-bed-flat-1749761936830	\N	2025-06-12 21:58:56.829733	2025-06-12 23:27:18.146311	2025-06-12 23:27:18.146311	1	f	\r\nDon’t miss out on this fantastic property! Contact our student accommodation agents in Birmingham now or enquire online	\N
23	30	2 Bed Flat	Student Rooms for Rent in Selly Oak\r\nIntroducing these spacious 4-bedroom student rooms for rent in Selly Oak, available from 01/07/2025 until 30/06/2026. Fully furnished, designed for student needs, and conveniently located within walking distance of the University of Birmingham.\r\n\r\nPriced at £100 per person per week with a deposit of £434 per person.\r\n\r\nFor added convenience, we offer the HOUSR Bills package at an additional cost, ensuring that utility expenses are taken care of hassle-free. Click HERE for more information.\r\n\r\nStudents will benefit from the exemption of the property’s Council Tax (Band B).\r\n\r\nEach of the four bedrooms provides ample space for studying and relaxation, ensuring that everyone feels at home.\r\n\r\nThe heart of this property lies in its cosy vibe with a separate kitchen and lounge. Additionally, the garden with private access provides a peaceful outdoor retreat, ideal for enjoying sunny days or hosting small gatherings.\r\n\r\nSituated in Selly Oak, residents have access to an array of amenities, including shops, restaurants, and entertainment options. The bustling shopping districts and vibrant nightlife of Birmingham are just a stone’s throw away, offering endless opportunities for exploration and enjoyment. This property provides seamless access to Selly Park, reachable with just a 16-minute walk, and convenient public transportation links to other university campuses.\r\n\r\nThis meticulously designed student accommodation harmoniously blends space, comfort, and convenience. With its unbeatable location and well-appointed amenities, it offers students the perfect place to call home during their academic journey.\r\n\r\nDon’t miss out on this incredible opportunity! Contact us today to schedule a viewing or enquire about renting options.\r\n\r\nProperty ID: M-PS383	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	2	3.0	\N	\N	\N	\N	3000.00	24	3000.00	1	f	f	t	f	t	pending	f	2025-06-21	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	2-bed-flat-1749779760389	\N	2025-06-13 02:56:00.385348	2025-06-13 02:56:00.385348	\N	\N	t	Student Rooms for Rent in Selly Oak\r\nIntroducing these spacious 4-bedroom student	230.00
24	30	3 attached	A stunning collection of 1 & 2 bedroom apartments and duplexes in the heart of Birmingham's prestigious Jewellery Quarter. Now complete and ready to move into, The Pressworks offers a unique opportunity to own a home in a beautifully restored Grade II listed building combined with high-quality new build elements.\r\n\r\nApartments are offered unfurnished, but furnishing packages are available at an additional cost, making it easy to move straight in or prepare for letting.\r\n\r\nCarefully designed to reflect the site's industrial heritage, the development blends original features with a contemporary finish. Over-height ceilings, exposed roof trusses, restored brick walls, and Crittall-style windows give each home an authentic character and a stylish industrial-chic aesthetic.\r\n\r\nEach apartment includes an open-plan kitchen and living area with a modern specification throughout. Kitchens feature integrated appliances, handleless cabinetry, Egger laminate worktops and splashbacks, and Imola tiled flooring. Bathrooms are fitted with contemporary sanitaryware from Roca and chrome fixtures and fittings. Timber flooring is fitted in living areas with carpet in the bedrooms.	rent	\N	266 Hospital Street	\N	Birmingham	\N	B19 2YF	United Kingdom	2	3.0	\N	\N	\N	\N	1200.00	12	2000.00	1	f	f	f	f	t	pending	f	2025-06-18	Fatemeh Rahimi	07385777431	fa.rahimi5475@gmail.com	3-attached-1749848331721	\N	2025-06-13 21:58:51.716573	2025-06-13 21:58:51.716573	\N	\N	f	A stunning collection of 1 & 2 bedroom apartments and duplexes in the heart of B	300.00
25	30	ddd	About this property\r\nOld Heaton House has undergone a labour of love spanning five years, skilfully designed and meticulously restored to its former glory by Elevate Property Group. Today, it stands as an extraordinary, one-of-a-kind private residence situated in the heart of Birmingham's historic Jewellery Quarter, adorned with flawless craftsmanship.\r\n\r\nThis property offers a thoughtfully curated living space, meticulously crafted with high-quality materials, traditional finishes, exquisite sanitary ware, paintwork, and modern amenities. From its stunning herringbone parquet flooring to the elegant Winchester cast iron baths, every last detail of interior design and traditional ornamentation has been taken into account to breathe new life into this magnificent and unique villa.\r\n\r\nAll primary rooms are generously proportioned, featuring high ceilings and detailing that one would not typically associate with city centre living but rather with a grand stately home. They are tastefully furnished to harmonise with the property's unique Georgian heritage, having been remodelled with an exclusive blend of the finest quality materials and cutting-edge technology.\r\n\r\nThe grand master bedroom suite boasts an awe-inspiring high ceiling, a dressing area, and a lavish en-suite bath/shower room. The guest suite enjoys the luxury of its own en-suite shower room, while the three additional bedrooms share a beautifully appointed family bathroom.\r\n\r\nStep outside to discover your ideal sanctuary! A modern, lightweight aluminium pergola with a louvered roof canopy and blinds ensures year-round usability. The terrace is adorned with premium garden furniture, creating an inviting space for loungin	rent	\N	266 clarmont	\N	Birmingham	\N	B19 2YF	United Kingdom	1	3.0	\N	\N	\N	\N	3.00	6	3.00	1	f	f	f	f	t	pending	f	2025-07-01	Fatemeh Rahimi	07385777422	fa.rahimi5475@gmail.com	ddd-1750076216220	\N	2025-06-16 13:16:56.216297	2025-06-16 13:16:56.216297	\N	\N	f	\N	-1.00
26	30	ddd	About this property\r\nOld Heaton House has undergone a labour of love spanning five years, skilfully designed and meticulously restored to its former glory by Elevate Property Group. Today, it stands as an extraordinary, one-of-a-kind private residence situated in the heart of Birmingham's historic Jewellery Quarter, adorned with flawless craftsmanship.\r\n\r\nThis property offers a thoughtfully curated living space, meticulously crafted with high-quality materials, traditional finishes, exquisite sanitary ware, paintwork, and modern amenities. From its stunning herringbone parquet flooring to the elegant Winchester cast iron baths, every last detail of interior design and traditional ornamentation has been taken into account to breathe new life into this magnificent and unique villa.\r\n\r\nAll primary rooms are generously proportioned, featuring high ceilings and detailing that one would not typically associate with city centre living but rather with a grand stately home. They are tastefully furnished to harmonise with the property's unique Georgian heritage, having been remodelled with an exclusive blend of the finest quality materials and cutting-edge technology.\r\n\r\nThe grand master bedroom suite boasts an awe-inspiring high ceiling, a dressing area, and a lavish en-suite bath/shower room. The guest suite enjoys the luxury of its own en-suite shower room, while the three additional bedrooms share a beautifully appointed family bathroom.\r\n\r\nStep outside to discover your ideal sanctuary! A modern, lightweight aluminium pergola with a louvered roof canopy and blinds ensures year-round usability. The terrace is adorned with premium garden furniture, creating an inviting space for loungin	rent	\N	266 alfered	\N	Birmingham	westmidland	B19 2ge	United Kingdom	1	2.0	\N	\N	\N	\N	1200.00	12	2390.00	1	f	f	t	f	f	pending	f	2025-07-02	Fatemeh Rahimi	07385777412	fa.rahimi5475@gmail.com	ddd-1750077382866	\N	2025-06-16 13:36:22.862432	2025-06-16 13:36:22.862432	\N	\N	f	\N	290.00
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
68	21	/uploads/21_0_bg-7.jpg	image	0	2-Bed Flat	2025-06-12 21:58:56.829733
69	21	/uploads/21_1_bg-6.jpg	image	1	2-Bed Flat	2025-06-12 21:58:56.829733
70	21	/uploads/21_2_bg-5.jpg	image	2	2-Bed Flat	2025-06-12 21:58:56.829733
71	21	/uploads/21_3_bg-4.jpg	image	3	2-Bed Flat	2025-06-12 21:58:56.829733
76	23	/uploads/23_0_bg-6.jpg	image	0	2 Bed Flat	2025-06-13 02:56:00.385348
77	23	/uploads/23_1_bg-4.jpg	image	1	2 Bed Flat	2025-06-13 02:56:00.385348
78	23	/uploads/23_2_bg-5.jpg	image	2	2 Bed Flat	2025-06-13 02:56:00.385348
79	23	/uploads/23_3_bg-9.jpg	image	3	2 Bed Flat	2025-06-13 02:56:00.385348
80	24	/uploads/24_0_bg-7.jpg	image	0	3 attached	2025-06-13 21:58:51.716573
81	24	/uploads/24_1_bg-8.jpg	image	1	3 attached	2025-06-13 21:58:51.716573
82	24	/uploads/24_2_bg-9.jpg	image	2	3 attached	2025-06-13 21:58:51.716573
83	24	/uploads/24_3_bg-47.jpg	image	3	3 attached	2025-06-13 21:58:51.716573
84	25	/uploads/25_0_bg-3.jpg	image	0	ddd	2025-06-16 13:16:56.216297
85	25	/uploads/25_1_bg-6.jpg	image	1	ddd	2025-06-16 13:16:56.216297
86	25	/uploads/25_2_bg-4.jpg	image	2	ddd	2025-06-16 13:16:56.216297
87	25	/uploads/25_3_bg-5.jpg	image	3	ddd	2025-06-16 13:16:56.216297
88	26	/uploads/26_0_bg-47.jpg	image	0	ddd	2025-06-16 13:36:22.862432
89	26	/uploads/26_1_bg-8.jpg	image	1	ddd	2025-06-16 13:36:22.862432
90	26	/uploads/26_2_bg-9.jpg	image	2	ddd	2025-06-16 13:36:22.862432
91	26	/uploads/26_3_bg-7.jpg	image	3	ddd	2025-06-16 13:36:22.862432
96	28	/uploads/28_0_pexels-pixabay-273244.jpg	image	0	3 bed falt 	2025-06-16 20:52:31.965089
97	28	/uploads/28_1_pexels-pixabay-259588 (1).jpg	image	1	3 bed falt 	2025-06-16 20:52:31.965089
98	28	/uploads/28_2_pexels-pixabay-209274.jpg	image	2	3 bed falt 	2025-06-16 20:52:31.965089
99	28	/uploads/28_3_pexels-myburgh-3081701.jpg	image	3	3 bed falt 	2025-06-16 20:52:31.965089
100	29	/uploads/29_0_bg5.jpg	image	0	ddd	2025-06-16 20:55:34.51863
101	29	/uploads/29_1_bg9.jpg	image	1	ddd	2025-06-16 20:55:34.51863
102	29	/uploads/29_2_bg7.jpg	image	2	ddd	2025-06-16 20:55:34.51863
\.


--
-- Data for Name: property_submissions; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.property_submissions (id, property_id, user_id, submission_type, admin_notes, rejection_reason, reviewed_by, reviewed_at, created_at) FROM stdin;
10	4	30	new	\N	\N	\N	\N	2025-06-09 23:35:00.411985
17	4	30	review	\N	\N	1	2025-06-09 23:55:53.234857	2025-06-09 23:55:53.234857
25	10	30	new	\N	\N	\N	\N	2025-06-12 13:29:54.253482
26	11	30	new	\N	\N	\N	\N	2025-06-12 18:14:51.90297
28	13	30	new	\N	\N	\N	\N	2025-06-12 18:38:14.786059
29	14	30	new	\N	\N	\N	\N	2025-06-12 20:01:17.342711
30	15	30	new	\N	\N	\N	\N	2025-06-12 20:13:25.526802
31	16	30	new	\N	\N	\N	\N	2025-06-12 20:30:56.747663
32	17	30	new	\N	\N	\N	\N	2025-06-12 20:38:25.570427
33	18	30	new	\N	\N	\N	\N	2025-06-12 21:00:55.17767
34	19	30	new	\N	\N	\N	\N	2025-06-12 21:15:32.243758
35	20	30	new	\N	\N	\N	\N	2025-06-12 21:31:50.802694
36	21	30	new	\N	\N	\N	\N	2025-06-12 21:58:56.829733
38	20	30	review	\N	\N	1	2025-06-12 23:27:06.103236	2025-06-12 23:27:06.103236
40	21	30	review	\N	\N	1	2025-06-12 23:27:18.148186	2025-06-12 23:27:18.148186
41	23	30	new	\N	\N	\N	\N	2025-06-13 02:56:00.385348
42	24	30	new	\N	\N	\N	\N	2025-06-13 21:58:51.716573
43	25	30	new	\N	\N	\N	\N	2025-06-16 13:16:56.216297
44	26	30	new	\N	\N	\N	\N	2025-06-16 13:36:22.862432
46	28	30	new	\N	\N	\N	\N	2025-06-16 20:52:31.965089
47	29	30	new	\N	\N	\N	\N	2025-06-16 20:55:34.51863
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: fatemehrahimi
--

COPY public.users (id, email, password, first_name, last_name, google_id, created_at, updated_at, picture, is_verified, reset_token, reset_token_expiry, role, phone) FROM stdin;
30	fa.rahimi5475@gmail.com	$2a$10$iGTq/vWqqrWi33Lr1VfKeerWBI60oLlShyCGcqOd3oLsW1aIHvHZy	Fatemeh	Rahimi	105426167604603741023	2025-06-03 13:01:22.443846	2025-06-18 02:27:36.644878	https://lh3.googleusercontent.com/a/ACg8ocKDGOgwNGQKtyptaWyfpZbonCXEChKr-SZtILMljvpMMLuxKPE=s96-c	t	\N	\N	user	\N
31	test@example.com	\N	Test	User	\N	2025-06-05 23:33:02.629718	2025-06-05 23:33:02.629718	\N	f	\N	\N	user	\N
32	admin@property.com	$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi	Admin	User	\N	2025-06-05 23:33:02.63194	2025-06-05 23:33:02.63194	\N	t	\N	\N	admin	\N
29	shahrzadrahy@gmail.com	$2a$10$KnlW1D8I3V7okpARte8nku7N.7KUIoF4Ea3uBzE7g.RtvgS9S8z7O	SHAHRZAD	RAHIMI	102682520512212166024	2025-06-03 13:00:32.098063	2025-06-12 12:06:03.238763	https://lh3.googleusercontent.com/a/ACg8ocJidz-393UeVq0v4aNCZlw-Zlhp7HH6rwhdaoldwpQ7K9c2bmw=s96-c	t	\N	\N	user	\N
33	profiletest@example.com	$2a$10$EVG2BTKN2OUiKZdsO.pCluzFANNDq1Rhorl5lkKIpw9AXcGPTtvjq	Updated	TestUser	\N	2025-06-10 22:52:37.630605	2025-06-10 22:52:37.668044	\N	t	\N	\N	user	+1 (555) 777-8888
\.


--
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.admins_id_seq', 5, true);


--
-- Name: email_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.email_notifications_id_seq', 74, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.properties_id_seq', 29, true);


--
-- Name: property_amenities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_amenities_id_seq', 1, false);


--
-- Name: property_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_images_id_seq', 102, true);


--
-- Name: property_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: fatemehrahimi
--

SELECT pg_catalog.setval('public.property_submissions_id_seq', 47, true);


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

