## 1. KARRAS Platform Framing

KARRAS is a modular platform for technical problem-solving tools.

- Some modules are **simulation / decision-support** products that help users test constrained systems before acting on them.
- Some modules are **operational / workflow** products that help users run important technical processes when existing infrastructure is weak, missing, or inefficient.

This framing keeps the current bridge module valid while making room for a second module that solves a different class of problem without pretending it is also a simulation.

### 1.1 Module Classes

| Module Class | Purpose | Current Example |
|--------------|---------|-----------------|
| Simulation / Decision-Support | Model constraints, compare options, explain tradeoffs, and support planning decisions | Bridge feasibility screening |
| Operational / Workflow | Deliver a working digital process where physical or institutional infrastructure is inadequate | Virtual coding lab |

### 1.2 Platform Positioning Statement

**KARRAS is a modular platform for serious technical tools, combining simulation-based decision support with operational systems that solve real-world infrastructure and workflow constraints.**

## 2. Virtual Lab Module Definition

### 2.1 Module Name

**KARRAS Virtual Lab**

### 2.2 Module Type

**Operational / Workflow Module**

### 2.3 Core Problem

Many institutions need to run practical coding education, but:

- students may only have smartphones or unreliable personal devices
- departments may not have functioning computer labs
- institutions may lack the infrastructure to run, manage, and grade coding assignments consistently
grading is a mess
thrid party tools are expensive
one workflow
manual availability
manual prices
queues
grading problems
practical sheduling

This creates a gap between the curriculum and the institution's ability to actually deliver practical programming work.

### 2.4 Module Purpose

KARRAS Virtual Lab is a mobile-first practical coding delivery platform that enables institutions to issue coding assignments, receive student submissions, manage grading workflows, and export academic results without depending on a functional physical computer lab.

### 2.5 Product Positioning Statement

**KARRAS Virtual Lab enables practical coding education in low-infrastructure environments by giving institutions a mobile-first system for assignment delivery, student coding access, submission handling, grading, and result export.**

## 3. Product Principles

### 3.1 Mobile-First, Not Mobile-Only

- The student experience must work well on phones because that is the hardest real constraint.
- The same experience must remain comfortable on laptops and desktops.
- Mobile-first is an access strategy, not a restriction.

### 3.2 Institution-Ready, Not Consumer-Only

- The platform must feel like something a school or department could actually adopt.
- Branding, course structure, semester structure, staff roles, and exports must be part of the product.

### 3.3 Workflow Before Fancy Tooling

- Credibility comes from solving the academic workflow end to end.
- A realistic assignment -> submission -> grading -> export loop matters more than flashy editor features.

### 3.4 Honest MVP Scope

- The MVP does not need to replace every LMS or online judge.
- The MVP must prove that the institution can run practical coding coursework through the platform.

## 4. Target Users

### 4.1 Institution Admin

Responsible for institution-level setup and operational oversight.

Needs:
- set up institution workspace
- manage academic session structure
- manage departments, courses, staff, and student access
- personalize the environment for the institution

### 4.2 Instructor / Staff

Responsible for practical course delivery and grading.

Needs:
- create and publish coding assignments
- review student submissions
- grade with scores and comments
- manage multiple courses in a semester
- export grades cleanly

### 4.3 Student / Learner

Responsible for completing and submitting coding work.

Needs:
- access assignments from a phone or laptop
- write and submit code comfortably
- track deadlines, submission state, grades, and feedback

## 5. Core User Stories

### 5.1 Institution Stories

- As an institution admin, I want each school or department to have a branded workspace so the platform feels deployable and owned.
- As an institution admin, I want to organize practical coursework by session, semester, department, and course.
- As an institution admin, I want staff and students to access the right courses with the right permissions.

### 5.2 Instructor Stories

- As an instructor, I want to create coding assignments for multiple courses in a semester.
- As an instructor, I want to review student submissions and grade them from one workflow surface.
- As an instructor, I want to export grades for reporting or record submission.

### 5.3 Student Stories

- As a student, I want to access coding assignments on my phone if I do not have a laptop.
- As a student, I want to submit practical work without needing a physical computer lab.
- As a student, I want to see my submission status, grades, and instructor feedback clearly.

## 6. MVP Scope

### 6.1 Must-Have Capabilities

#### Institution Layer

- institution workspace setup
- institution branding: name, logo, accent color
- session / semester structure
- course and roster organization
- role-based access across admin, instructor, and student

#### Instructor Layer

- course dashboard
- assignment creation and publishing
- assignment deadline management
- submission review table
- grading with score and written feedback
- grade export per course

#### Student Layer

- assignment feed by enrolled course
- assignment detail page
- mobile-friendly coding workspace
- draft save or submission-state retention
- submission flow
- grade and feedback view

### 6.2 Nice-To-Have After MVP

- language-specific auto-checks
- execution sandbox / compile-and-run support
- plagiarism or similarity checks
- analytics by cohort or course
- integration with external school systems

### 6.3 Explicitly Out Of Scope For First MVP

- full LMS replacement
- deep live collaboration
- video teaching features
- advanced proctoring
- large-scale enterprise analytics
- broad marketplace / public learner features

## 7. Product Surfaces

### 7.1 Module Launcher

Purpose:
- present KARRAS as a multi-module platform
- show Virtual Lab as an operational module beside simulation modules

### 7.2 Institution Dashboard

Purpose:
- entry point for admins and staff
- show session, course, assignment, and grading activity

### 7.3 Course Workspace

Purpose:
- hold course-specific assignments, roster, and grading workflow

### 7.4 Assignment Builder

Purpose:
- create practical coding tasks
- define prompt, instructions, due date, course, and submission settings

### 7.5 Student Coding Workspace

Purpose:
- provide a clean mobile-first area for students to read prompts, write code, and submit work

### 7.6 Grading Console

Purpose:
- let staff review submissions, assign grades, leave comments, and track grading progress

### 7.7 Reports / Exports

Purpose:
- export grades and submission outcomes for institutional use

## 8. Page Map

| Route / Surface | Primary User | Purpose |
|-----------------|--------------|---------|
| Module Launcher | All users | Choose Bridge or Virtual Lab module |
| Institution Sign-In | Admin / Staff / Student | Enter institution-scoped access flow |
| Institution Dashboard | Admin / Staff | View academic structure and activity |
| Course Detail | Admin / Staff | View assignments, roster, and status by course |
| Assignment Builder | Staff | Create and publish coding assignments |
| Student Assignments | Student | View current and past coding tasks |
| Coding Workspace | Student | Complete and submit assignment work |
| Grading Console | Staff | Review and grade submissions |
| Export Center | Admin / Staff | Export course or semester grade data |

## 9. Credibility Requirements

These are the minimum qualities that make the module feel serious rather than like a student prototype.

### 9.1 Institutional Identity

- each institution has its own workspace identity
- academic structure is visible and believable

### 9.2 Role Separation

- admin, staff, and student experiences are clearly different
- each role sees only the tools relevant to them

### 9.3 Real Academic Workflow

- assignments move through a believable lifecycle: draft, published, submitted, graded, exported
- course and semester context are visible at every stage

### 9.4 Mobile Usability

- students can comfortably use the product on a phone
- key tasks do not rely on desktop-only interaction patterns

### 9.5 Exportability

- instructors can export grades and outcomes in a format institutions can use

### 9.6 Auditability

- submission timestamps
- grading state
- assignment status
- feedback history

## 10. UX Direction

### 10.1 Student UX

- minimal, focused, and calm
- assignment prompt first, code workspace second
- large touch-safe actions
- submission confidence and status made obvious

### 10.2 Staff UX

- dashboard-like and structured
- tables, filters, status chips, grading summaries
- designed for reviewing many students and many assignments

### 10.3 Admin UX

- settings-oriented and organizational
- institution structure, users, courses, and exports

## 11. Data Model Direction

The virtual lab module needs a different domain model from the bridge module. The likely core entities are:

- Institution
- Department
- Academic Session
- Semester
- Course
- Course Membership
- Assignment
- Submission
- Grade Record
- User
- Role

This should be treated as a separate domain slice inside KARRAS rather than forced into the current scenario schema.

## 12. Technical Notes For MVP

### 12.1 Frontend Direction

- keep the current React + TypeScript + Zustand stack
- use route separation for module launcher, staff surfaces, and student surfaces
- keep mobile-first behavior strongest in the student coding workspace

### 12.2 Backend Direction

- move beyond generic scenario storage for this module
- introduce structured entities for institutions, courses, assignments, submissions, and grades
- maintain lightweight storage for MVP but shape the data model as if it could scale

### 12.3 Coding Workspace Direction

- prioritize a clean code entry and submission experience first
- do not overclaim full cloud IDE behavior if not implemented
- support manual grading first, then add richer execution or auto-checking later

## 13. Credibility Boundaries

The MVP should be honest about what it is and is not.

### 13.1 What The MVP Proves

- institutions can structure coding coursework in the platform
- students can access and submit work from phones or laptops
- staff can grade and export results
- practical programming workflows can continue without a physical lab

### 13.2 What The MVP Does Not Yet Prove

- advanced execution sandboxing at production scale
- comprehensive LMS replacement
- deep automated grading intelligence
- proctoring or exam security guarantees

## 14. Demo Narrative

### 14.1 Demo Positioning

The demo should present Virtual Lab as a serious institutional tool, not just a flashy student editor.

### 14.2 Demo Story

An institution lacks reliable computer lab infrastructure, but still needs to run practical coding courses across a semester. KARRAS Virtual Lab provides a branded institutional workspace where staff can publish coding assignments, students can complete them from mobile devices or laptops, instructors can grade submissions, and the institution can export results cleanly.

### 14.3 Demo Flow

1. Show KARRAS module launcher with both the bridge module and Virtual Lab module.
2. Open a branded institution workspace to establish that this is school-ready software.
3. Show a semester with several coding-related courses.
4. Open a course and show an assignment published by an instructor.
5. Switch to student view and show the mobile-first assignment experience.
6. Demonstrate code entry or a saved draft / submission flow.
7. Return to staff view and show the grading console with several student submissions.
8. Grade a submission with score and feedback.
9. Show course-level grade export.
10. Close by reconnecting Virtual Lab to the wider KARRAS platform framing.

### 14.4 Demo Outcome

The audience should leave with this understanding:

- KARRAS is not one product type only
- it can host both simulation tools and operational systems
- Virtual Lab is a credible response to broken or missing academic computing infrastructure

## 15. Immediate Build Implications

If this module moves into implementation, the next design and engineering tasks should be:

1. define the information architecture for admin, staff, and student surfaces
2. define the MVP data model for institution, course, assignment, submission, and grade entities
3. design the student coding workspace for strong mobile usability
4. design the instructor grading console and export workflow
5. update KARRAS navigation and platform framing so both module classes are explicit
