# Trajectory Desktop Help Guide

Trajectory Desktop is the **workflow runner** for the Trajectory family. It loads workflow packages (`.WFmasterX`) created in the Trajectory Workflow Editor and runs them step by step — entirely in your browser.

> **PLEASE NOTE:** Trajectory is a demonstration system, not intended for production environments. The editor and runtime are single-user systems and do not have the security necessary for production use. We recommend loading the applications into a Docker container for your testing.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Loading a Workflow](#2-loading-a-workflow)
3. [Running a Workflow](#3-running-a-workflow)
4. [Environment Actions and Action Servers](#4-environment-actions-and-action-servers)
5. [Overview and History](#5-overview-and-history)
6. [Settings](#6-settings)
7. [Devices and Layout](#7-devices-and-layout)

---

## 1. Getting Started

Open Trajectory Desktop in your browser. The app has five screens, reached from the tab bar (along the bottom on a phone, down the left side on a tablet or desktop):

| Screen | Purpose |
| ------- | ------- |
| **Home** | Load workflow packages and start them |
| **Active** | Step through the workflows that are currently running |
| **Overview** | See live diagrams of running workflows |
| **History** | Review workflows that have finished |
| **Settings** | Preferences, data management, and this help guide |

No sign-in is required, and nothing is installed — workflows run in the browser.

---

## 2. Loading a Workflow

On the **Home** screen:

1. Click **Load Workflow** and choose a `.WFmasterX` file (the package exported from the Trajectory Workflow Editor). On desktop you can also **drag and drop** the file onto the drop zone.
2. The workflow appears under **Loaded Workflows**.
3. Click it to open the **Start** dialog, which shows the workflow name, version, and description.
4. Click **Start** to begin. You are taken to the **Active** screen.

A workflow can require a connection to an Action Container before it starts — see [Environment Actions and Action Servers](#4-environment-actions-and-action-servers).

---

## 3. Running a Workflow

The **Active** screen shows the steps that are currently running, one card at a time (swipe or use the dots to move between several active steps).

**Interactive steps** — *User Interaction* and *Yes/No* steps — display the screen that was designed on the editor's UI Canvas. They can contain:

- text and headings, images, and video
- text inputs and multi-line text boxes
- checkbox and radio (pick-one) groups
- buttons
- timers

Fill in any required fields; action buttons stay disabled until the required fields are satisfied. A **Yes/No** step shows its content plus two buttons that send the run down the Yes path or the No path. A **timer** counts down (or up) and has play/pause and reset controls.

**Automatic steps** — such as scripts and waits — run on their own and show a brief "Processing…" card; no input is needed.

When a workflow finishes, a completion notice appears and the run moves to **History**.

---

## 4. Environment Actions and Action Servers

Some workflow steps are **Environment Actions** — operations that run on a separate **Trajectory Action Container** rather than in the browser. When you start a workflow that uses them, Trajectory Desktop asks which server to use:

- If the workflow's environment has **no registered server**, enter the Action Container's address (for example `http://localhost:3002`) and click **Connect**.
- If it has **several registered servers**, pick one and click **Use**.
- Click **Abandon workflow** to cancel instead.

Once connected, the workflow starts and its Environment Action steps call that server as they execute.

---

## 5. Overview and History

**Overview** shows a live diagram of each running workflow — in Flowchart, BPMN, or ISA 88 notation — with the current step highlighted. Use the dots to move between workflows.

**History** lists finished workflows with their outcome (Completed, Errored, or Stopped) and finish time. Open one to see a step-by-step log; click a step to view its input and output values (and any error or script source).

---

## 6. Settings

The **Settings** screen includes:

- **Notifications** — be notified when new steps become active (asks for browser permission).
- **Confirmations** — whether deleting loaded or completed workflows asks first.
- **Data Management** — clear all history, and view or release the **Environment** and **Workflow** resources currently held.
- **Action Server Mapping** — how a workflow's actions are matched to a server: **Name** (match by environment/action names) or **Exact** (the workflow's identifiers must match the server exactly).
- **About** — the app version and a link to this help guide.

---

## 7. Devices and Layout

Trajectory Desktop adapts to the device:

- **Phone** — tabs along the bottom; single-column screens.
- **Tablet** — tabs in a side rail; roomier multi-column screens.
- **Desktop** — tabs in a side rail, with an optional workflow **diagram** pane alongside the active step.

Workflow screens are authored for phone, tablet, and desktop in the editor, and Trajectory Desktop renders the layout that fits the current device.
