# Zoho CRM Manager

## Overview

This is a full-stack web application built for managing Zoho CRM operations, specifically focused on account management, contact creation, and email marketing campaigns. The application provides a modern React frontend with a Node.js/Express backend, enabling users to connect multiple Zoho accounts, manage contacts, send individual and bulk emails, and track email statistics.

The system is designed as a CRM management tool that simplifies Zoho API interactions through an intuitive web interface, allowing users to perform common CRM tasks without directly working with Zoho's APIs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: Shadcn/ui components built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom design system using CSS variables
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Form Handling**: React Hook Form with Zod validation for type-safe forms

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for full-stack type safety
- **API Design**: RESTful API with clear endpoint structure for CRUD operations
- **Session Management**: Express sessions with PostgreSQL session store
- **Error Handling**: Centralized error handling middleware with proper HTTP status codes

### Data Storage
- **Database**: PostgreSQL for persistent data storage
- **ORM**: Drizzle ORM for type-safe database queries and migrations
- **Schema Management**: Drizzle Kit for database migrations and schema evolution
- **Connection**: Neon Database serverless PostgreSQL for cloud deployment

### Authentication & Authorization
- **Zoho OAuth**: Integration with Zoho's OAuth 2.0 flow for secure API access
- **Token Management**: Automatic access token refresh using stored refresh tokens
- **Token Caching**: In-memory caching of access tokens to minimize API calls
- **Account Validation**: Real-time validation of Zoho credentials before storage

### External Service Integrations
- **Zoho CRM API**: Primary integration for contact management, user operations, and data retrieval
- **Zoho Mail API**: Email sending capabilities with template support
- **Zoho Analytics**: Email statistics and performance tracking
- **Token Refresh**: Automated handling of OAuth token lifecycle

### Development & Deployment
- **Development**: Hot module replacement with Vite for fast development cycles
- **Build Process**: Separate client and server builds with optimized bundling
- **Environment**: Configurable for development, staging, and production environments
- **Static Assets**: Integrated static file serving for images and documents

### Key Design Patterns
- **Separation of Concerns**: Clear separation between frontend UI, backend API, and data layers
- **Type Safety**: End-to-end TypeScript implementation with shared types
- **Error Boundaries**: Graceful error handling and user feedback throughout the application
- **Responsive Design**: Mobile-first responsive design with Tailwind CSS utilities
- **Component Composition**: Reusable UI components following atomic design principles

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query**: Server state management and caching
- **wouter**: Lightweight routing for React applications
- **drizzle-orm**: Type-safe SQL query builder and ORM
- **@neondatabase/serverless**: Serverless PostgreSQL database driver

### UI and Styling
- **@radix-ui/**: Complete set of accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Utility for creating variant-based component APIs
- **lucide-react**: Modern icon library with React components

### Development and Build Tools
- **vite**: Fast build tool and development server
- **typescript**: Static type checking for JavaScript
- **tsx**: TypeScript execution environment for Node.js
- **esbuild**: Fast JavaScript bundler for production builds

### Backend Services
- **express**: Web application framework for Node.js
- **axios**: HTTP client for making API requests to Zoho services
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### Zoho API Integration
- **Zoho CRM API**: Contact management, lead tracking, and user operations
- **Zoho Mail API**: Email sending and template management
- **Zoho Accounts API**: OAuth authentication and token management
- **Zoho Analytics API**: Email statistics and performance metrics

### Database and Data Management
- **PostgreSQL**: Primary database for account and session storage
- **Drizzle Kit**: Database migration and schema management tool
- **Zod**: Schema validation library for form data and API inputs