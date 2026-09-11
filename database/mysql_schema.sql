-- ============================================================
-- Virtual CS Lab — MySQL Schema for XAMPP / MariaDB
-- ============================================================

CREATE DATABASE IF NOT EXISTS `virtual_lab` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `virtual_lab`;

-- ============
-- users table
-- ============
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL DEFAULT 'demo1234',
  `role` ENUM('instructor', 'student') NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `matric_no` VARCHAR(100) UNIQUE NULL,
  `faculty` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  `level` INT NULL,
  `phone` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============
-- manuals table
-- ============
CREATE TABLE IF NOT EXISTS `manuals` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `instructor_id` VARCHAR(36) NOT NULL,
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
  `points` INT NOT NULL DEFAULT 10,
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

-- ============================================================
-- SEED DATA (Demo Users & Sample Manual)
-- ============================================================

-- Insert Demo Users
INSERT INTO `users` (`id`, `email`, `password`, `role`, `full_name`, `faculty`, `department`, `phone`, `matric_no`, `level`)
VALUES
('u-inst-1', 'instructor@demo.com', 'demo1234', 'instructor', 'Dr. Chukwuemeka Chukwu', 'Faculty of Technology', 'Department of Computer Science & Engineering', '+234 803 111 2244', NULL, NULL),
('u-inst-2', 'instructor.chukwu@oau.edu.ng', 'demo1234', 'instructor', 'Dr. Chukwuemeka Chukwu', 'Faculty of Technology', 'Department of Computer Science & Engineering', '+234 803 111 2244', NULL, NULL),
('u-stud-1', 'student@demo.com', 'demo1234', 'student', 'Olaoluwa Adebayo Adeyemi', 'Faculty of Technology', 'Department of Computer Science & Engineering', '+234 812 334 5566', 'CSC/2020/048', 200),
('u-stud-2', 'ola.adeyemi.200489@oau.edu.ng', 'demo1234', 'student', 'Olaoluwa Adebayo Adeyemi', 'Faculty of Technology', 'Department of Computer Science & Engineering', '+234 812 334 5566', 'CSC/2020/049', 200),
('u-stud-3', 'precious.okafor.200512@oau.edu.ng', 'demo1234', 'student', 'Precious Chiamaka Okafor', 'Faculty of Technology', 'Department of Computer Science & Engineering', '+234 805 778 9911', 'CSC/2019/012', 300)
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- Insert Sample Manual
INSERT INTO `manuals` (`id`, `instructor_id`, `course_code`, `title`, `description`, `semester`, `deadline`, `published`, `created_at`)
VALUES
('m-sample-1', 'u-inst-1', 'CSC 201', 'Introduction to Python & Data Structures', 'Comprehensive semester manual for CSC 201 laboratory practicals.', 'Harmattan 2024/2025', '2026-12-31 23:59:59', 1, NOW())
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

-- Insert Sample Tasks for Manual
INSERT INTO `tasks` (`id`, `manual_id`, `order_index`, `title`, `instruction_text`, `language`, `starter_code`, `expected_output`, `points`)
VALUES
('t-sample-1', 'm-sample-1', 1, 'Exercise 1: Basic Math & Output', 'Write a Python program that calculates and prints the sum of two integers: 15 and 27.', 'python', '# Write your code below\na = 15\nb = 27\n# Print sum here\n', '42', 10),
('t-sample-2', 'm-sample-1', 2, 'Exercise 2: List Operations', 'Create a list of numbers [5, 12, 3, 8], sort them in ascending order, and print the sorted list.', 'python', '# Write your code below\nnumbers = [5, 12, 3, 8]\n', '[3, 5, 8, 12]', 15)
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

-- Enroll Demo Student in Sample Manual
INSERT INTO `manual_enrollments` (`id`, `manual_id`, `student_id`)
VALUES
('enr-sample-1', 'm-sample-1', 'u-stud-1'),
('enr-sample-2', 'm-sample-1', 'u-stud-2')
ON DUPLICATE KEY UPDATE `joined_at` = NOW();
