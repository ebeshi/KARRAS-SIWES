-- ============================================================
-- Virtual CS Lab — MySQL Schema for XAMPP / MariaDB
-- ============================================================

CREATE DATABASE IF NOT EXISTS `virtual_lab` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `virtual_lab`;

-- ============
-- institutions table
-- ============
CREATE TABLE IF NOT EXISTS `institutions` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `school_code` VARCHAR(50) NOT NULL UNIQUE,
  `location` VARCHAR(255) NULL,
  `website` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- faculties table
-- ============
CREATE TABLE IF NOT EXISTS `faculties` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `institution_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_fac_code` (`institution_id`, `code`),
  CONSTRAINT `fk_fac_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- departments table
-- ============
CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `institution_id` VARCHAR(36) NOT NULL,
  `faculty_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_dept_code` (`faculty_id`, `code`),
  CONSTRAINT `fk_dept_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dept_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- users table
-- ============
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'instructor', 'student') NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `institution_id` VARCHAR(36) NULL,
  `faculty_id` VARCHAR(36) NULL,
  `department_id` VARCHAR(36) NULL,
  `matric_no` VARCHAR(100) UNIQUE NULL,
  `admission_year` INT NULL,
  `serial_no` VARCHAR(20) NULL,
  `faculty` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  `level` INT NULL,
  `phone` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_users_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculties` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- manuals table
-- ============
CREATE TABLE IF NOT EXISTS `manuals` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `instructor_id` VARCHAR(36) NOT NULL,
  `institution_id` VARCHAR(36) NULL,
  `course_code` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `semester` VARCHAR(50) NULL,
  `manual_pdf_url` TEXT NULL,
  `deadline` DATETIME NOT NULL,
  `published` TINYINT(1) NOT NULL DEFAULT 0,
  `import_batch_id` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_manuals_instructor` FOREIGN KEY (`instructor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- tasks table
-- ============
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `manual_id` VARCHAR(36) NOT NULL,
  `order_index` INT NOT NULL DEFAULT 1,
  `title` VARCHAR(255) NOT NULL,
  `instruction_text` TEXT,
  `pdf_section_label` VARCHAR(255) NULL,
  `pdf_page_start` INT NULL,
  `pdf_page_end` INT NULL,
  `language` VARCHAR(50) NOT NULL DEFAULT 'python',
  `starter_code` TEXT,
  `expected_output` TEXT NULL,
  `points` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_manual_order` (`manual_id`, `order_index`),
  CONSTRAINT `fk_tasks_manual` FOREIGN KEY (`manual_id`) REFERENCES `manuals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- manual_enrollments table
-- ============
CREATE TABLE IF NOT EXISTS `manual_enrollments` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `manual_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_enrollment` (`manual_id`, `student_id`),
  CONSTRAINT `fk_enrollments_manual` FOREIGN KEY (`manual_id`) REFERENCES `manuals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- task_submissions table
-- ============
CREATE TABLE IF NOT EXISTS `task_submissions` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `task_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `manual_id` VARCHAR(36) NOT NULL,
  `code` LONGTEXT,
  `draft_code` LONGTEXT NULL,
  `submitted_at` DATETIME NULL,
  `auto_passed` TINYINT(1) NULL,
  `run_output` LONGTEXT NULL,
  `grade` INT NULL,
  `feedback` TEXT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'not_started',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_task_student` (`task_id`, `student_id`),
  CONSTRAINT `fk_subs_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subs_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subs_manual` FOREIGN KEY (`manual_id`) REFERENCES `manuals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
