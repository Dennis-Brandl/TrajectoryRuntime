#  Trajectory Runtime Execution System  {#trajectory-runtime-execution-system .TOC-Heading}

# Introduction

Project Trajectory[^1] is the development of a distributed workflow system
for individuals and work groups using personnel devices such as
smartphones and tablets, and for area, site, or enterprise level
workflow systems using standard IT equipment.

A workflow defines any activity that is a sequence and/or set of actions
that must be performed to accomplish a goal. Examples of consumer
workflow types include exercise routines, party planning, recipes, trip
planning, and instruction manuals. Examples of business workflow types
include expense report filling, weekly activity checklists, and service
call resolution checklist. Examples of manufacturing workflows include
recipe execution, equipment startup procedures, equipment shutdown
procedures, and emergency response procedures. Workflows can be
triggered by external event, time, location, messages or any other
defined event.

Workflows are generated within a department or group in a company,
across the entire company, or even across companies in a supply chain.
Workflow requirements often change and require distributed workflows to
be revised or replaced. This work describes a set of applications and
interface specifications that allow for exchange of workflow
specifications and communication of triggers and information between
independent workflow execution environments.

Trajectory is envisioned as a crowd sourcing application, with individuals
authoring workflows that can be downloaded and executed by other users.
For example, a person may author a recipe as a workflow and upload it to
the Trajectory website for distribution. Each workflow is defined as a set
of actions and their sequencing[^2]. A user may then download the recipe
workflow and execute it on their smartphone or tablet, and the workflow
would walk the user through the actions of the recipe[^3].

Trajectory Mobile is envisioned as a mobile application for Android and
iPhones for workflow execution, with a supporting web site for workflow
development and workflow distribution. Personal users would download
workflow definitions into their device from the Trajectory web site and
then execute an instance of the workflow. The workflow could prompt the
user to take actions, such as present information, collect input from
the user, send email, send text messages, display information to the
user, and take other mobile device appropriate actions[^4] through a set
of predefined actions executing on the mobile device. Trajectory Mobile
will also allow for the download of additional locally executed actions.

Trajectory Pro is envisioned as an area, site and enterprise level set of
applications to create Master Workflows, manage Master Workflow
libraries, manage Master Action libraries, create and execute Runtime
Workflows, and provide a set of preengineered Runtime Actions and
environments.

Trajectory will include a limited set of default actions, in an action
library, which will handle a majority of the anticipated initial uses.
Additional action libraries may be created by users for custom
functionality. For example, a travel agency may define a workflow action
that retrieves the lowest price for a plane flight. This action could
then be used inside a trip planning workflow.

The workflow execution systems in Trajectory Mobile and Trajectory Pro will
have the same functionality, but will be marked differently and priced
differently.

Trajectory's income model is multi-fold:

- Income as a mobile phone application, with a zero or low entry price.

- Income from ads on Trajectory Mobile screens.

- Income from ads on the Trajectory web site.

- Income from protected workflows. Workflow authors will have the
  ability to sign and protect their workflows and require a fee or
  license to run the workflow. This will be enabled through a public key
  / private key mechanism. The income will come from the fee to manage
  the public/private key mechanism.

- Income from protected action libraries. Action library editors will
  have the ability to distribute their libraries and require a fee or
  license to run the actions. This will be enabled through a public key
  / private key mechanism. The income will come from the fee to manage
  the public/private key mechanism.

- Leasing/subscription model for support of area, site, or enterprise
  level workflow creation and management.

## Trajectory Mobile 

The default Trajectory Mobile version consists of:

- A Trajectory website that contains Master Workflow Specifications, a
  default set of Master Action Specifications, a default set of Runtime
  Action Realizations, and a default set of Master Environment
  Specifications.

- A Runtime Mobile Execution System which is available on tablets and
  smart phones. It executes the set of predefined UI steps to provide
  user interaction on PCs, tablets, and smartphones.

- Optional vendor websites which contain Master Workflow Specifications,
  Master Environment Specifications and Master Action Specifications
  which can be downloaded to augment the default runtime execution
  systems.

![](media/image1.emf){width="5.211009405074366in"
height="3.1555555555555554in"}

## Trajectory Pro

The default Trajectory Pro version consists of:

- A template for a vendor defined website that contains Master Workflow
  Specifications, a set of Master Action Specifications, a set of
  Runtime Action Realizations, and a set of Master Environment
  Specifications.

- A Runtime Service Execution System which is available as a service
  that implements Workflows with direct UI interactions, and/or a
  Runtime Mobile Execution System where UI is needed on PCs, tablets and
  smart phones.

- A template for a system to create and manage Master Action
  Specifications, which the vendor may use to create a system for their
  environment.

- A template for a Runtime Action Execution system, which the vendor may
  use to create a system for their specific actions and execution
  environment.

![](media/image2.emf){width="4.322916666666667in"
height="3.228893263342082in"}

# Runtime Execution System Requirements

This specification is for a runtime engine that interprets downloaded
workflows, executes the workflow steps, and provides a user interface to
built-in step types.

Rest calls while offline are to be queued until the connection is
available.

There are joins with the parallels and a set of rules that determine if
a workflow is valid (it actually ends, there is a start and end, no
un-joined parallels, etc).

There are human tasks across multiple instances (my vision is a STEP
screen that has a sweep left and sweep right to walk through the
multiple active steps),

There is instance persistence (the workflows should start at the last
active steps).

## Workflow Data Import

Workflows packages are imported from a ZIP file which contains a set of
JSON files and image files. The JSON files include the Master Workflow
Specification with the step network and contain the UI elements for User
Interaction steps, all referenced Master Workflow Environments, and all
referenced Master Action Specifications.

1)  If a Master Workflow Specification already exists in local storage,
    then replace it with the new Master Workflow Specification.

2)  If a Master Workflow Specification is updated the running instances
    (Runtime Workflow Instance) use the old version with no active
    migration (following the ISA 88 master recipe/control recipe model).

3)  If a Master Environment Specification already exists in local
    storage, then merge the existing Master Environment Specification
    with the new Master Environment Specification, but do not change the
    values in any Value Property in the existing Master Environment
    Specification

4)  If a Master Action Specification already exists in local storage,
    then replace the existing specification with the new Master Action
    Specification.

5)  Keep all of the "oid"s when importing. The oid's are needed to link
    environments in the execution environment with the environment in
    Runtime Action systems. The oid's are also needed to link the
    Environment Actions in the execution environment with the actions in
    Runtime Action systems.

Use the following file extensions for the ZIP files:

- .WFmasterX -- for Master Workflow Specification packages

- .WFenvirX -- for Master Environment Specification packages

## User Interface Requirements

### Execution Environments

The system must be able to run in Android and iOS smart phone, tablets,
and Windows PCs.

The JSON contains a lot of the UI formatting, position of objects,
fonts, colors, images, text entry, timers, etc \...

The form_layout_config is already a declarative UI specification. Don\'t
redesign screens per platform. Build a renderer on each platform that
interprets the JSON and outputs native widgets.

Trajectory MD (designer)

│

▼

form_layout_config JSON ──── THE UI IS ALREADY DESIGNED

│

├──► Android Renderer → Kotlin/Compose native views

├──► iOS Renderer → Swift/SwiftUI native views

└──► Web Renderer → HTML/CSS/React components

Each renderer does the same thing:

1\. Pick the breakpoint --- check screen size, select the matching
FormLayoutExportEntry (phone/tablet/desktop)

2\. Scale the canvas --- your JSON uses logical pixels with known canvas
sizes (390×844 for phone, etc.). Scale to actual screen dimensions.

3\. Walk the elements array --- for each element, switch on type and
emit a native widget

4\. Apply absolute positioning --- every element has x, y, width,
height. This is canvas-style layout, not responsive which is actually
simpler to implement.

The renderer per platform is straightforward because the mapping is
mechanical:

┌───────────┬───────────────────────┬───────────────┬─────────────────────────┐

│ JSON type │ Android (Compose) │ iOS (SwiftUI) │ Web │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ text │ Text() │ Text │ \<p\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ header │ Text() bold │ Text bold │ \<h1\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ button │ Button() │ Button │ \<button\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ textInput │ TextField() │ TextField │ \<input\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ textarea │ TextField() multiline │ TextEditor │ \<textarea\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ checkbox │ Checkbox() group │ Toggle group │ \<input
type=\"checkbox\"\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ radio │ RadioButton() group │ Picker │ \<input type=\"radio\"\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ image │ AsyncImage() │ AsyncImage │ \<img\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ video │ ExoPlayer │ AVPlayer │ \<video\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ divider │ Divider() │ Divider │ \<hr\> │

├───────────┼───────────────────────┼───────────────┼─────────────────────────┤

│ timer │ Custom composable │ Custom view │ Custom component │

└───────────┴───────────────────────┴───────────────┴─────────────────────────┘

The renderer on each platform is one component --- roughly something
like:

// Android pseudocode

\@Composable

fun WorkflowStepRenderer(layout: FormLayoutExportEntry) {

Box(modifier = Modifier.size(layout.canvasWidth.dp,
layout.canvasHeight.dp)) {

layout.elements.forEach { element -\>

Box(modifier = Modifier

.offset(x = element.x.dp, y = element.y.dp)

.size(element.width.dp, element.height.dp)

.zIndex(element.zIndex)

) {

when (element.type) {

\"text\" -\> RenderText(element)

\"button\" -\> RenderButton(element)

\"textInput\" -\> RenderTextInput(element)

// \... etc

}

}

}

}

}

iOS and Web would have the equivalent --- same structure, native
widgets.

What you\'re building per platform is NOT a UI --- it\'s a form
renderer. That\'s a single component, maybe 500-800 lines per platform,
that handles all 11 element types. Every workflow, every step, every
screen flows through this one renderer.

The only platform-specific UI work beyond the renderer is:

\- The step navigation (your swipe left/right between active steps)

\- The instance list / task inbox

\- App chrome (navigation bar, settings, etc.)

Those are thin and standard. The heavy UI work --- the actual workflow
step screens is already defined in your JSON.

### Startup Screen

Show a splash screen with the Trajectory Icon and brief text

- Downloading a Workflow

- Start a Workflow

- View Active Workflows

- View Active Steps

- Control a Workflow

### Active Step Screen

Swipe left/right to cycle through active steps

Swipe up to a screen that shows the next steps, by name

Swipe down to a screen that shows previous steps (by name) and provides
a way to stop the current step and restart execution at a previous step.

### Common Screen Controls

Using the three dot right/top model for control, let the 3-dot control
have options to PAUSE a step, RESUME a step, ABANDON a step (which is an
ABORT in the state model).

Have a 5-button panel on the bottom of the screen, with Home, Overview,
Active, Library, and Settings.

- Home goes to the startup screen

- Overview goes to a screen that shows a thumbnail of the current
  workflow, with colors to indicate executes steps, active steps, and
  future steps. It provides a way to see how far someone is in executing
  the workflow.

- Active goes to the active step screen

- Library goes to the library of downloaded workflows

- Settings goes to a screen where settings are defined

  - Enable/disable notification of active steps

  - Current Version of the Runtime engine displayed, copyright
    displayed, other information and selections to be added later

## Starting a Workflow 

Make a copy of the Master Workflow Specification to create a Runtime
Workflow. This is the same model as the ISA 88 Master Recipe and Control
Recipe model. There is a specific instance of a Runtime Workflow for
each active workflow. It contains its own Value Properties, Resources,
etc ...\\

When creating a Runtime Workflow, create new oid's for the workflow and
the workflow steps. Unique oid's are needed to link to Environment
Actions. There can be multiple instances of an Environment Action active
at the same time, each communicating with a different Runtime Workflow

Find all START steps in the workflow and make the START steps active.

## Ending a Workflow

For all steps, when entering the COMPLETE state, execute any Release
resource commands. Resources are acquired at the start of steps, and
released at the completion of the steps.

For Environment Actions, when action is in the COMPLETE state and the
output parameters have been received, send a DELETE Runtime Action
Instance to the action server.

## Workflow State

Workflow State

- IDLE - All steps are IDLE

- RUNNING - At least one step is in an active state (not IDLE and not
  COMPLETED)

- PAUSED - All active steps are PAUSED or HELD

- COMPLETED - An END node has reached COMPLETED

- ABORTED - User aborted the workflow --- all active steps are
  ABORTING/ABORTED

- STOPPED - User stopped the workflow --- all active steps are
  STOPPING/COMPLETED

State is recoverable after app restart, the engine resumes from the last
persisted state for all active workflows.

# State Model

## Step and Action Instance State Model

There are two types of steps, opaque and observable.

Observable steps can be controlled through HOLD, UNHOLD, PAUSE, RESUME,
ABORT and STOP commands, and their internal state is visible.

Opaque steps do not necessarily have visibility into internal states.
They may, or may not, respond to commands depending on their internal
logic and their connection to external systems.

![](media/image3.emf){width="7.0in" height="4.204166666666667in"}

### State Descriptions

State descriptions in the Runtime Workflow Step Instance and Runtime
Action Instance state models.

+-------------+------------------------------------------------+
| State       | Description                                    |
+=============+================================================+
| IDLE        | Initial state of the step or action instance,  |
|             | instance is created, waiting for a START or    |
| (Initial    | ABORT command. This is the initial Runtime     |
| State)      | Action Instance state when it is created (with |
|             | a POST) command.                               |
+-------------+------------------------------------------------+
| WAITING     | A start command has been received, and the     |
|             | step or action is waiting:                     |
|             |                                                |
|             | First -- until a SYNC resource command has     |
|             | been matched, and                              |
|             |                                                |
|             | Second -- until all required resources are     |
|             | acquired.                                      |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| POSTED      | Indicates that the START was posted to an      |
|             | opaque step or action.                         |
|             |                                                |
|             | On a STOP commend, the command is sent to the  |
|             | opaque step or action, the state or action     |
|             | determines what, if anything is done with the  |
|             | command.                                       |
|             |                                                |
|             | On an ABORT commend, the command is sent to    |
|             | the opaque step or action, the state or action |
|             | determines what, if anything is done with the  |
|             | command.                                       |
+-------------+------------------------------------------------+
| RECEIVED    | Indicates from an opaque step or action that   |
|             | the START was received, but the task has not   |
|             | yet started.                                   |
|             |                                                |
|             | On a STOP commend, the command is sent to the  |
|             | opaque step or action, the state or action     |
|             | determines what, if anything is done with the  |
|             | command.                                       |
|             |                                                |
|             | On an ABORT commend, the command is sent to    |
|             | the opaque step or action, the state or action |
|             | determines what, if anything is done with the  |
|             | command.                                       |
+-------------+------------------------------------------------+
| IN PROGRESS | Indicates from an opaque step or action that   |
|             | the step or task is in progress.               |
|             |                                                |
|             | On a STOP commend, the command is sent to the  |
|             | opaque step or action, the state or action     |
|             | determines what, if anything is done with the  |
|             | command.                                       |
|             |                                                |
|             | On an ABORT commend, the command is sent to    |
|             | the opaque step or action, the state or action |
|             | determines what, if anything is done with the  |
|             | command.                                       |
+-------------+------------------------------------------------+
| STARTING    | Executing any tasks needed before the step or  |
|             | action can enter the executing state, such as  |
|             | starting motors or turning on power.           |
|             |                                                |
|             | Upon completing of the starting tasks, control |
|             | passes to the EXECUTING state.                 |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| EXECUTING   | Executing the tasks defines by the step or     |
|             | action.                                        |
|             |                                                |
|             | Upon normal completion, control passes to a    |
|             | COMPLETEING state.                             |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| COMPLETING  | Executing any tasks needed after the step or   |
|             | action has completed executing state, such as  |
|             | stopping motors or turning off power.          |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the COMPLETED state.                           |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| COMPLETED   | The step or action has completed.              |
+-------------+------------------------------------------------+
| HOLDING     | Executing any tasks needed to go into the      |
|             | HOLDING state, such as putting the system into |
|             | a safe state. The HOLD command typically comes |
|             | from an internal source, such as going to HOLD |
|             | for breaks.                                    |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the HELD state.                                |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| HELD        | Temporarily interrupts the EXECUTING state     |
|             | after receiving a HOLD command.                |
|             |                                                |
|             | Executing any tasks, if any, needed to remain  |
|             | in the HELD state, such as maintaining the     |
|             | system into a safe state.                      |
|             |                                                |
|             | Upon a UNHOLD command, control passes to the   |
|             | UNHOLDING state.                               |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| UNHOLDING   | Executing any tasks needed to go back to the   |
|             | EXECUTING state after a HOLD.                  |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the EXECUTING state.                           |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| PAUSING     | Executing any tasks needed to go into the      |
|             | PAUSED state, such as putting the system into  |
|             | a safe state. The PAUSE command typically      |
|             | comes from an external source, such as a       |
|             | downstream system temporarily blocked.         |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the PAUSED state.                              |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| PAUSED      | Executing any tasks, if any, needed to remain  |
|             | in the PAUSED state.                           |
|             |                                                |
|             | Upon a RESUME command, control passes to the   |
|             | UNPAUSING state.                               |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| UNPAUSING   | Executing any tasks needed to go back to the   |
|             | EXECUTING state after a PAUSE.                 |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the EXECUTING state.                           |
|             |                                                |
|             | Upon a STOP command, control passes to a       |
|             | STOPPING state.                                |
|             |                                                |
|             | Upon an ABORT command, control passed to an    |
|             | ABORTING state.                                |
+-------------+------------------------------------------------+
| STOPPING    | Executing any tasks needed to bring the step,  |
|             | action, or controlled systems into a safe      |
|             | state, such as powering down equipment in a    |
|             | specific order.                                |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the COMPLETED state.                           |
+-------------+------------------------------------------------+
| ABORTING    | Executing the tasks needed to abort the step   |
|             | or action, and to discard any work done so     |
|             | far, if possible.                              |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the ABORTED state.                             |
+-------------+------------------------------------------------+
| ABORTED     | Executing the tasks needed to keep the step or |
|             | action in an aborted state.                    |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the COMPLETED state.                           |
|             |                                                |
|             | If the ABORTED state tasks require clearing    |
|             | any faults, such as clearing a production      |
|             | line, when a CLEAR command is received,        |
|             | control passes to a CLEARING state.            |
+-------------+------------------------------------------------+
| CLEARING    | Complete the tasks needed to clear any faults. |
|             |                                                |
|             | Upon completing the tasks, control passes to   |
|             | the COMPLETED state.                           |
+-------------+------------------------------------------------+

### State commands

The list of valid state commands are the following:

- START: This command orders the procedural element to transition from
  the IDLE state to the WAITING state.

- PAUSE: This command orders the procedural element to transition from
  the EXECUTING state to the PAUSED state.

- RESUME: This command orders a procedural element to transition from
  the PAUSED state to the EXECUTING state.

- HOLD: This command orders the procedural element to transition from
  the EXECUTING state to the HELD state.

- UNHOLD: This command orders the procedural element to transition from
  the HELD state to the EXECUTING state.

- STOP: This command orders the procedural element to transition from
  the WAITING, STARTING, EXECUTING, COMPLETING, HOLDING, HELD,
  UNHOLDING, PAUSING, PAUSED, AND UNPAUSING state to the STOPPING state.

- ABORT: This command orders the procedural element to transition from
  the WAITING, STARTING, EXECUTING, COMPLETING, HOLDING, HELD,
  UNHOLDING, PAUSING, PAUSED, AND UNPAUSING state to the ABORTING state.

### State Transition Matrix

Table 3 --- State transition matrix for example states for procedural
elements

+----------------+--------------------------------------------------------------------------------------------------------------------------------------+
| **Current      | **Transition End State upon receiving each Valid State Command or internal State Change (SC)**                                       |
| State**        |                                                                                                                                      |
|                +--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
|                | **START**    | **STOP**     | **HOLD**     | **UNHOLD**   | **PAUSE**    | **UNPAUSE**  | **ABORT**    | **CLEAR**    | **SC**       |
|                +--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
|                |                                                                                                                                      |
+================+:============:+:============:+:============:+:============:+:============:+:============:+:============:+:============:+:============:+
| **IDLE**       | WAITING      |              |              |              |              |              | ABORTING     |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **WAITING**    |              | STOPPING     |              |              |              |              | ABORTING     |              | Note 1       |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **POSTED**     |              | Note 2       | Note 2       |              | Note 2       |              | Note 2       |              | RECEIVED     |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **RECEIVED**   |              | Note 2       | Note 2       |              | Note 2       |              | Note 2       |              | IN PROGRESS  |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **IN           |              | Note 2       | Note 2       |              | Note 2       |              | Note 2       |              | COMPLETED    |
| PROGRESS**     |              |              |              |              |              |              |              |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **STARTING**   |              | STOPPING     |              |              |              |              | ABORTING     |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **EXECUTING**  |              | STOPPING     | HOLDING      |              | PAUSING      |              | ABORTING     |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **COMPLETING** |              | STOPPING     |              |              |              |              | ABORTING     |              | COMPLETED    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **COMPLETED**  |              | STOPPING     |              |              |              |              |              |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **HOLDING**    |              | STOPPING     |              |              |              |              | ABORTING     |              | HELD         |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **HELD**       |              | STOPPING     |              | UNHOLDING    |              |              | ABORTING     |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **UNHOLDING**  |              | STOPPING     |              |              |              |              | ABORTING     |              | EXECUTING    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **PAUSING**    |              | STOPPING     |              |              |              |              | ABORTING     |              | PAUSED       |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **PAUSED**     |              | STOPPING     |              |              |              | UNPAUSING    | ABORTING     |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **UNPAUSING**  |              | STOPPING     |              |              |              |              | ABORTING     |              | EXECUTING    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **STOPPING**   |              |              |              |              |              |              | ABORTING     |              | STOPPED      |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **STOPPPING**  |              |              |              |              |              |              |              |              | COMPLETED    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **ABORTING**   |              |              |              |              |              |              |              |              |              |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **ABORTED**    |              |              |              |              |              |              |              | CLEARING     | COMPLETED    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+
| **CLEARING**   |              |              |              |              |              |              |              |              | COMPLETED    |
+----------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+--------------+

NOTE 1: When all resources, if any, are acquired, and the step is a
PROXY to a Runtime Action or another complete workflow, then the step
goes to the POSTED state. When all resources, if any, are acquired, the
step is not a link to a Runtime Action then the step goes to the
STARTING state.

NOTE 2: Opaque steps do not necessarily expose or send their internals
states, but if they do, they should expose at least the three POSTED,
RECEIVED, AND IN PROGRESS states.

## Step Processing Requirements

### Start Step

- Created in IDLE

- Immediately transitions: IDLE → WAITING → STARTING → EXECUTING →
  COMPLETING → COMPLETED

- No user interaction, no resources, no parameters

### End Step

- Created in IDLE

- Transitions: IDLE → WAITING → STARTING → EXECUTING → COMPLETING →
  COMPLETED

- Triggers workflow completion when reached

- If multiple END nodes exist, workflow completes when any END is
  reached

### All Steps

On entry to the step if the input parameter source is defined, the get
the input parameter values from the specified value property.

On exit from the step, copy the output parameters to any identified
Value Properties, log completion of the step, make it no longer active,
and run the workflow to start the steps on the outgoing connections. For
the Yes/No step and the Select 1 step, start the steps on the selected
outgoing connection.

### Environment Step

This is for future specifications. Currently show a simple message that
shows the name of the Environment step and then completes. Eventually
there will be a REST interface to a Runtime Action that will implement
the action.

- \*\*Observable\*\*: Full state model via SSE connection to action
  server

  - STARTING: REST invoke sent, awaiting runtime_action_instance_id

  - EXECUTING: Action server processing, state updates via SSE

  - Supports HOLD/UNHOLD from action server, PAUSE/RESUME from user

- \*\*Opaque\*\*: Simplified flow

  - POSTED: Invoke sent (or queued offline)

  - RECEIVED: Action server acknowledged

  - IN_PROGRESS: Action server processing

  - COMPLETED: Result received with output parameters

When the device is offline and an action proxy step is activated:

\| Action Visibility \| Offline State \| Behavior \|

\|\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\--\|\-\-\-\-\-\-\-\-\-\--
\-\--\|\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\--\|

\| Opaque \| POSTED \| Invoke request queued locally. Step shows

POSTED. On reconnect, queue is replayed. \|

\| Observable \| WAITING \| Step remains in WAITING (cannot transition

to STARTING without action server

confirmation). On reconnect, invoke is sent

and normal state flow begins. \|

### User Interaction Step

- STARTING: Form layout loaded, rendered for current device type. Expand
  out the Rich Text Format to include Workflow or Environment Value
  Properties.

- EXECUTING: Form displayed to user, added to active-step carousel

- User submits form,

  - Copy any text entry to the identified Workflow or Environment Value
    property,

  - Copy the selected item names in a Checkbox in an array to the
    identified Workflow or Environment Value Property

  - Copy the selected item name in a Radio Button Group to the
    identified Workflow or Environment Value

  - output parameters written → COMPLETING → COMPLETED

<!-- -->

- Supports PAUSE/RESUME (form state preserved)

### Yes/No Step

- STARTING: Form layout loaded, rendered for current device type. Expand
  out the Rich Text Format to include Workflow or Environment Value
  Properties.

- EXECUTING: Form displayed to user, added to active-step carousel

- User submits form,

  - Copy any text entry to the identified Workflow or Environment Value
    property,

  - Copy the selected item names in a Checkbox in an array to the
    identified Workflow or Environment Value Property

  - Copy the selected item name in a Radio Button Group to the
    identified Workflow or Environment Value

  - output parameters written → COMPLETING → COMPLETED

<!-- -->

- Supports PAUSE/RESUME (form state preserved)

- Start the True branch or the False branch

### Script Step

This step executes JavaScript code in a sandbox when executed.

JavaScript covers 95% of what workflow authors need, has zero-cost
embedding on iOS, near-zero on Android, and is native on web.

The one thing to get right: sandbox the execution. Don\'t give scripts
access to the network, filesystem, or the engine itself. Only expose the
input parameters and output parameters.

\- STARTING: input parameters prepared

\- EXECUTING: script running in sandbox

\- COMPLETING: Output parameters extracted from script results

\- Supports PAUSE (script execution suspended) / ABORT (script
terminated)

### Child Workflow Step

This is a placeholder step with no UI. Child workflows are just an
editing aid; they break up a long workflow into smaller elements. The
user does not see the child workflow structure. When entering a child
workflow immediately go the Start Step in the child workflow. When the
Child workflow completes, then this step is completed.

- STARTING: Child Runtime Workflow created from embedded child workflow
  spec

- EXECUTING: Child workflow is running (state mirrors child workflow
  state)

- COMPLETING: Child workflow reached END, output parameters propagated

- Supports PAUSE (pauses entire child workflow) / ABORT (aborts child
  workflow)

### Select 1 

- STARTING: Input parameter resolved

- EXECUTING: Condition evaluated against options using spec operators

- COMPLETING: Matching branch identified, connection followed

- Fully automatic --- no user interaction

### Wait Any

Join point. Transitions to COMPLETING when the first incoming branch
COMPLETES. Remaining branches may continue executing but their results
are not awaited.

### Parallel

Fork point. EXECUTING activates all outgoing branches concurrently.

### Wait All 

Join point. Remains in EXECUTING until all incoming branches have
COMPLETED.

## Resource Use

Resources may represent physical equipment, logical equipment, or
abstract limited availability objects or information

The system allows for single use resources, multiple use resources with
limits, and named resource pools.

Allow for acquiring and releasing resources within workflows and
environments, and acquiring partial resources

### Resource Property Specifications

Resources are specific properties that are managed by the runtime
execution system. They provide a method to control access to limited use
capabilities. The resources may represent physical entities, such as
Bags or Totes, virtual entities, or any other entity type.

Resource Property Specifications are used as templates for creating
Resource Property Realizations from master elements. They contain a name
of the resource, the type of resource (binary exclusive use, binary
shared use with use limits, shared use with use limits, or SYNC point),
an optional use limit, and an optional description of the resource.

Resource acquiring requests are queued. Requests on single and multiple
use resources are served on a first come first served basis. (NOTE: To
prevent deadlocks, all requests from a single runtime are alphabetically
sorted by resource name.)

The Resource Property Specifications define resource properties in
master definitions.

- Single use resource -- The property represents a single resource that
  can only be used by one runtime workflow at a time.

- Multiple use resource -- The property represents a set of resources
  that can be used by multiple runtime workflows at the same time, but
  that have a limit on multiple use.

- Resource Amount Pool -- The property represents a set of named
  resources that can be used by multiple runtime workflows at the same
  time, with each resource in the pool independently identified.

- Named Resource -- The resource is defines as a set of names (strings).
  Acquiring a resource returns the name and prevents that resource from
  being acquired by others (such as "Loading Dock 1", "Loading Dock 2",
  "Loading Dock 3"). Return of the resource returns the named resource
  to the pool.

- Sync Resource. A Sync resource is used to synchronize two steps in the
  same workflow, or across different workflows. Sync resources are
  named, when both steps acquire the resource then both steps can
  continue. The commands for Sync resources are: SEND, RECEIVE, SYNC. On
  a SEND command an output parameter is queued to send to the receiver
  and the sender waits for the receiver to RECEIVE the data. On the
  RECEIVE command an input parameter is received by the receiver and the
  receiver waits until the data is available. On a SYNC command there is
  no data exchange, both steps wait until they are both ready.

#### Resource Property Realizations

Resource Property Realizations are name/value pairs used to hold
information for the management of resources.

Resource Property Specifications define resource pools in runtime
definitions.

- Single use resource -- Contains a named resource property.

- Multiple use resource -- Contains a named resource property and a
  maximum use count.

- Resource Amount Pool -- Contains a named resource pool property with a
  set of named pool elements.

- Named Resource -- Contains a set of name that identify elements in the
  resource pool.

Resource types:

- Binary exclusive use -- Only one RunWF, RunWFStep, or RunWFStepIns at
  a time may use the resource. For example: a single mixer used by
  multiple kitchen lines.

- Binary shared use with pool limits -- Multiple RunWF, RunWFStep, and
  RunWFStepIns may use the resource at the same time, until the resource
  count reaches zero. Each acquire of the resource decreases the
  available count by one. Each release of the resource increases the
  availability count by one. For example: a set of knifes used by
  multiple cooks, but each cook only uses one knife at a time.

- Countable use with pool limits - Multiple RunWF, RunWFStep, and
  RunWFStepIns may use the resource at the same time, until the resource
  count reaches zero. Each acquire of the resource decreases the
  available count by the count specified by the acquire. Each release of
  the resource increases the availability count by the amount specified
  by the release. For example: a pool of mixing bowls, each with an ID,
  when each workflow may require a different number of bowls, and the
  bowls must be identified to be cleaned after use.

- Named -- Similar to a Binary Shared Use with pool limits, except that
  each resource has an associated name. For example: Multiple ovens in a
  kitchen, each with a specific name.

- Sync -- Used to synchronize two steps in the same workflow or across
  workflows. A data parameter may be sent from one step to another.

#### Resource Command Specifications

Resource command specifications are the definition of resource commands
in master definitions. The following commands for resources are:

- Acquire -- Identifies a resource to be acquired before the step can
  continue.

  - Example: Acquire *Mixer*

- Release -- Identifies a resource to be released.

  - Example: Release *Mixer*

- Acquire Pool Amount -- Identifies the amount of a resource to be
  acquired from a resource pool.

  - Example: Acquire 3 Bags from Bag Pool, returns IDs 123, 456,789

- Release Pool Amount -- Identifies the amount of a resource to be
  returned to the resource pool.

  - Example: Return 3 Bags to the Bag Pool, with IDs 123, 456, 789

- Release Name -- Identified the name of the resource returned to the
  resource pool

- Sync SEND -- Wait for the partner step and send an output parameter

- Sync RECEIVE -- Wait for the partner step and receive an input packet

- Sync SYNC -- Wait for the partner step, no data is exchanged.

#### Resource Commands

Resource commands are the definition of resource commands in runtime
definitions.

Resource Command behavior for steps:

- Acquire -- The step is put into the WAITING state until all the
  identified resources are acquired by the step.

  - Single Use Resource -

  - Resource Pool -- A local resource pool ID is returned for each
    resource acquired.

- Release -- When the step is COMPLETED all identified resources are
  released .

- Acquire Amount -- The step is put into the WAITING state until all
  identified resources are acquired at the requested amounts.

# Implementation Models

## Workflow Data Models

### Conceptual Main systems and Data Objects

The following model defines main systems and data objects of the system.

![](media/image4.emf){width="7.0in" height="6.134027777777778in"}

### Object Types and Property Types 

The following model shows:

1)  The "is a type of" relations,

- Managed Workflow Element is an abstract type.

- Master Workflow Libraries, Master Environment Libraries, Master Action
  Libraries, and Master Workflow Step Libraries are subtypes of Managed
  Workflow Elements

- Managed Instance Elements and Managed Master Elements are abstract
  types and are subtypes of Managed Workflow Elements

2)  Which objects have value property specifications,

3)  Which objects have value property realizations (actual values),

4)  Which objects have resource command specifications,

5)  Which objects have resource commands,

6)  Which objects have resource property specifications,

7)  Which objects have resource property realizations.

![](media/image5.emf){width="7.0in" height="5.616666666666666in"}

### Data Objects

#### Master Action Library (MasActLib)

A MasActLib is a collection of Master Actions Specifications.

A MasActLib is a specialized type of Managed Workflow Element.

Contains a local identification and OID of the MasActLib, an optional
description of the MasActLib, a version number, and the last modified
date.

#### Master Action Specification (MasActSpec)

A template and description for the information to be exchanged when
performing a Runtime Action Realization.

Contains a local identification and OID of the MasActSpec, an optional
description of the MasActSpec, a version number, and the last modified
date.

The specification does not define the logic in the action, it does
contain the input parameters specifications, output parameters
specifications, and property specifications.

- Input parameter specifications contain an ID, optional description, a
  default value and an optional JSON schema.

- Parameters are not typed and all values are represented as strings.
  This includes single values, arrays, structures, and other complex
  types.

- The JSON schema is used to provide type checking of input values
  against conformance criteria.

<!-- -->

- Output parameter specifications contain an ID and optional
  description.

#### Master Environment Library (MasEnvLib)

A MasEnvLib is a collection of Master Environment Specifications.

A MasEnvLib is a specialized type of Managed Workflow Element.

Contains a local identification and OID of the MasEnvLib, an optional
description of the MasEnvLib, a version number, and the last modified
date.

#### Master Environment Specification (MasEnvSpec)

A MasEnvSpec is a collection of IDs of Master Actions Specifications
that may be referenced by a Master Workflow Specification.

Contains:

- a local identification and OID of the MasEnvSpec,

- an optional description of the MasEnvSpec,

- a version number,

- the last modified date,

- a list of value property specifications, and

- a list of resource property specifications.

Master Workflow Steps in a Master Workflow Specification that reference
Actions may only use Master Action Specifications that are identified in
the Master Environment Specification.

#### Master Workflow Library (MasWFLib

A MasWFLib is a collection of Master Workflow Specifications.

A MasWFLib is a specialized type of Managed Workflow Element.

#### Master Workflow Step Library (MasWFStepLib)

A MasWFStepLib is a collection of Master Workflow Library Steps.

#### Master Workflow Specification (MasWFSpec)

A MasWFSpec contains:

- a collection of MasWFSteps and Workflow Step Connections,

- an optional set of Resource Command Specifications,

- an optional set of Value Property Specifications,

- an optional set of starting parameter specifications, and

- an optional set of output parameter specifications.

A MasWFSpec is a workflow template used to create RunWFs.

A MasWFSpec is a specialized type of Managed Master Element and Managed
Workflow Element.

#### Master Workflow Step (MasWFStep)

A MasWFStep contains an optional set of:

- Resource Command Specifications,

- Value Property Specifications,

- Input parameter specifications with default values,

- Output parameter specifications

A MasWFStep references zero or more Workflow Step Connections.

#### Master Workflow Library Step (MasWFLibStep)

A MasWFLibStep has the same structure as a MasWFStep.

#### Runtime Action Environment (RunActEnv)

A copy of a MasActEnv that is being used in Runtime Workflow execution
to identify the available actions, and to hold value property and
resource property definitions for the executing system. There may be
multiple RunActEnvs in a Runtime Workflow execution system.

#### Runtime Action Instance (RunActInst)

A single instance of execution of a Runtime Action.

#### Runtime Action Realization (RunActReal)

An object that represents a specific implementation of a Master Action
Specification, which is executing to a specific Runtime Action
Environment Each Runtime Action Realization element contains 2 parts:

1.  The information to be exchanged when performing the action, defined
    by the Master Action Specification. (Interface)

2.  The actual logic to perform each instance of the action, usually as
    a service, program, or application in a device. (Action Logic)

#### Runtime Workflow (RunWF)

An executable implementation of a Master Workflow Specification within
one or more Runtime Workflow Environments.

There may be multiple Runtime Workflows running at the same time in a
single Runtime Workflow execution system.

#### Runtime Workflow Environment (RunWEnv)

A local copy of the Master Environment Specifications associated with
the Runtime Workflow. It also contains the binding information to zero
or more Runtime Action Environments that is used to execute Runtime
Actions.

#### Runtime Workflow Execution System (RunWFExec)

The application, applications, or services that create and execute
Runtime Workflows.

#### Runtime Workflow Step (RunWFStep)

The definition of a step within a Runtime Workflow. Runtime Workflow

Steps may contain child steps in a hierarchy.

Receives START commands from each step that connect to it.

State commands to a step are passed down to child steps.

### Workflows

Workflows are represented as a collection of steps and connections.

Master Workflow Steps and Master Workflow Library Steps have the same
structure.

Master Workflow Specifications, Runtime Workflows Realizations have the
same workflow structure with the following exceptions:

1.  Master Workflow Specifications and Master Workflow Steps contain
    values for default value properties and resource properties.

2.  Runtime Workflow Specifications and Runtime Workflow Steps contain
    the actual values used in execution for value properties and
    resource properties.

#### Workflow Step Types

Step types are:

1.  START -- Defines the initial step in a workflow. There are no
    incoming connections. It may contain resource commands (ex: acquire
    resources) and completes when the resources are acquired and the
    outgoing connection is made active.

2.  END -- Defines the final step in a workflow. It may contain resource
    commands (ex: release resources) and completes when the resources
    are released. There are no outgoing connections. If the workflow is
    a sub-workflow then any input parameters are sent to the parent
    workflow as output parameters.

3.  WAIT ACTION PROXY -- Defines an action to be performed. It contains
    the information needed to exchange information with the Runtime
    Action Realization and Runtime Action Instance. Any step input
    parameters are sent to the action as action input parameters. Any
    received output parameters from the action are passed to the step's
    output parameters. The step waits until the action is COMPLETED
    before continuing and the outgoing connection is made active.

4.  NOWAIT ACTION PROXY -- Defines an action to be performed. It
    contains the information needed to exchange information with the
    Runtime Action Realization and Runtime Action Instance. Any step
    input parameters are sent to the action as action input parameters.
    Any received output parameters from the action are passed to the
    step's output parameters. The step does not wait until the action is
    COMPLETED before continuing and the outgoing connection is made
    active.

5.  WORKFLOW PROXY -- Defines a sub-workflow to be performed. It
    contains the identification of the sub-workflow. Any step input
    parameters are sent to the sub-workflow as input parameters. Any
    received output parameters from the sub-workflow are passed to the
    step's output parameters. The step waits until the sub-workflow ENDs
    before continuing and the outgoing connection is made active.

6.  SELECT -- Defines a step with multiple outgoing connections, with
    only one connection selected at a time. The set has one input
    parameter. Each outgoing connection contains a value, the connection
    value that matches the input parameter is made active. There is one
    connection defined as the default connection to use if none of the
    values match.

7.  MERGE -- Defines a step with multiple incoming connections. The step
    waits until any incoming connection is made active, then the step
    completes and the outgoing connection is made active.

8.  SPLIT -- Defines a set with multiple outgoing connections. All
    outgoing connections are made active.

9.  JOIN -- Defines a set of multiple incoming connections. When all
    incoming connections are active the step completes and the outgoing
    connection is made active.

10. MATH -- (FOR A FUTURE VERSION) Defines a set of mathematical
    equations that are executed. The step input is a list of assignment
    expressions. The left side of the assignment are output parameters.
    The right side of the assignment are simple expressions support
    numbers, strings, input parameters, and output parameters.

> Example EBNF:
>
> *(\* Assignment Statements Grammar \*)*
>
> *Assignment Step = { assignment } ;*
>
> *assignment = Output Parameter , \"=\", expression, \";\" ;*
>
> *expression = term, { (\"+\" \| \"-\"), term } ;*
>
> *term = factor, { (\"\*\" \| \"/\"), factor } ;*
>
> *factor = Input Parameter*
>
> *\| Output Parameter*
>
> *\| number*
>
> *\| string*
>
> *\| \"(\", expression, \")\" ;*
>
> *variable = letter, { letter \| digit \| \"\_\" } ;*
>
> *number = \[ \"-\" \], digit, { digit }, \[ \".\", digit, { digit } \]
> ;*
>
> *string = \'\"\', { string_char }, \'\"\'*
>
> *\| \"\'\", { string_char }, \"\'\" ;*
>
> *string_char = ? any character except quote marks and newlines ? ;*
>
> *letter = \"a\" \| \"b\" \| \"c\" \| \"d\" \| \"e\" \| \"f\" \| \"g\"
> \| \"h\" \| \"i\" \| \"j\"*
>
> *\| \"k\" \| \"l\" \| \"m\" \| \"n\" \| \"o\" \| \"p\" \| \"q\" \|
> \"r\" \| \"s\" \| \"t\"*
>
> *\| \"u\" \| \"v\" \| \"w\" \| \"x\" \| \"y\" \| \"z\"*
>
> *\| \"A\" \| \"B\" \| \"C\" \| \"D\" \| \"E\" \| \"F\" \| \"G\" \|
> \"H\" \| \"I\" \| \"J\"*
>
> *\| \"K\" \| \"L\" \| \"M\" \| \"N\" \| \"O\" \| \"P\" \| \"Q\" \|
> \"R\" \| \"S\" \| \"T\"*
>
> *\| \"U\" \| \"V\" \| \"W\" \| \"X\" \| \"Y\" \| \"Z\" ;*
>
> *digit = \"0\" \| \"1\" \| \"2\" \| \"3\" \| \"4\" \| \"5\" \| \"6\"
> \| \"7\" \| \"8\" \| \"9\" ;*

#### Workflow Step Connections

Workflow Step Connections define the structure of the workflow by
connecting Workflow Steps into a network.

The connections defined the execution order of steps. Each Workflow Step
Connections contains a FROM connection, which specifies what step it
comes from, and a TO connection which specifies what step it goes to.

In the example below there is a Workflow Step Connection between the
Assign Local Lot ID and the exclusive gateway (merging).

![](media/image6.emf){width="7.0in" height="2.6944444444444446in"}

#### Built-in Actions 

There are multiple different types of built-in actions in the Runtime
Workflow System:

1.  User Interface Action: The action contains a list of input
    parameters and the list of output variables that will contain the
    returned values.

    a.  Text

        i.  Input parameter -- text to be displayed

    b.  Text and Check Box

        i.  Input parameters -- text to display and list of check box
            texts

        ii. Output parameter -- selected text

    c.  Text and Entry

        i.  Input parameter -- test to be displayed

        ii. Output parameter -- entered text

    d.  Text and Typed Entry

        i.  Input parameter -- test to be displayed and JSON schema of
            allowed text

        ii. Output parameter -- entered text

    e.  Text and Select Multiple

        i.  Input parameter -- text to be displayed and list of selected
            texts

        ii. Output parameter -- list of returned selected texts

    f.  Display URL

        i.  Display the URI web site

2.  Service Action: An action which contains actions that can be
    immediately executed within the scope of the Runtime Action
    Execution System:

    a.  Wait for a specified delay time (DELAY)

    b.  Wait for a specified time of day (TIME)

    c.  Wait for a specified date and time (DATE)

    d.  Wait until at a specified location (LOCATION)

    e.  (FUTURE REQUIREMENT) Receipt of an Email with the specified
        subject line (EMAIL)

    f.  (FUTURE REQUIREMENT) Receipt of a text message with the
        specified text (TEXT)

3.  Management Action: An action which contains the information to
    change the state of another workflow, workflow step, or workflow
    action. This includes:

    a.  Pausing another workflow, step, or action

    b.  Resuming another workflow, step or action

    c.  Stopping another workflow, step, or action

    d.  Aborting another workflow, step, or action

4.  Remote Action: The action contains the name of a Master Workflow to
    be executed, and the list of input parameters to be used to start
    the Runtime Workflow. The following logic is used to determine the
    status of a remote workflow

    a.  Status of POSTED when the start message is posted

    b.  Status of RECEIVED when a response is received that the message
        was delivered

    c.  Status of IN PROGRESS sent on the completion of the first step
        in the work flow, captured with the time of the step. This
        allows the sender to determine if there is any progress on the
        remote workflow.

    d.  Complete sent on the completion of the workflow, along with any
        output parameters defined form the workflow.

### Properties

#### Value Property Specification

Value properties specifications are the definition of named values in
master elements that can be identified as input parameters to a step or
places to put output parameters from the execution of a step.

They contain a name for the property, an optional default value for the
property, and an optional description of the property. This information
is used to create a Value Property Realization.

Value property specifications are name / default value pairs.

#### Value Property Realizations 

Value property realizations are where the actual values are maintained
in runtime elements.

Value property realizations are name / actual value pairs.

Value property realizations are used to hold information passed to
actions and nested workflows, and to store information returned from
actions and nested workflows.

### Resources

Resources may represent physical equipment, logical equipment, or
abstract limited availability objects or information

The system allows for single use resources, multiple use resources with
limits, and named resource pools.

Allow for acquiring and releasing resources within workflows and
environments, and acquiring partial resources

#### Resource Property Specifications

Resources are specific properties that are managed by the runtime
execution system. They provide a method to control access to limited use
capabilities. The resources may represent physical entities, such as
Bags or Totes, virtual entities, or any other entity type.

Resource Property Specifications are used as templates for creating
Resource Property Realizations from master elements. They contain a name
of the resource, the type of resource (binary exclusive use, binary
shared use with use limits, or shared use with use limits), an optional
use limit, and an optional description of the resource.

Resource acquiring requests are queued. Requests on single and multiple
use resources are served on a first come first served basis. (NOTE: In
order to prevent deadlocks, all requests from a single runtime are
alphabetically sorted by resource name.)

The Resource Property Specifications define resource properties in
master definitions.

- Single use resource -- The property represents a single resource that
  can only be used by one runtime workflow at a time.

- Multiple use resource -- The property represents a set of resources
  that can be used by multiple runtime workflows at the same time, but
  that have a limit on multiple use.

- Resource Amount Pool -- The property represents a set of named
  resources that can be used by multiple runtime workflows at the same
  time, with each resource in the pool independently identified.

#### Resource Property Realizations

Resource Property Realizations are name/value pairs used to hold
information for the management of resources.

Resource Property Specifications define resource pools in runtime
definitions.

- Single use resource -- Contains a named resource property.

- Multiple use resource -- Contains a named resource property and a
  maximum use count.

- Resource Amount Pool -- Contains a named resource pool property with a
  set of named pool elements.

Resource types:

- Binary exclusive use -- Only one RunWF, RunWFStep, or RunWFStepIns at
  a time may use the resource. For example: a single mixer used by
  multiple kitchen lines.

- Binary shared use with pool limits -- Multiple RunWF, RunWFStep, and
  RunWFStepIns may use the resource at the same time, until the resource
  count reaches zero. Each acquire of the resource decreases the
  available count by one. Each release of the resource increases the
  availability count by one. For example: a set of knifes used by
  multiple cooks, but each cook only uses one knife at a time.

- Countable use with pool limits - Multiple RunWF, RunWFStep, and
  RunWFStepIns may use the resource at the same time, until the resource
  count reaches zero. Each acquire of the resource decreases the
  available count by the count specified by the acquire. Each release of
  the resource increases the availability count by the amount specified
  by the release. For example: a pool of mixing bowls, each with an ID,
  when each workflow may require a different number of bowls, and the
  bowls must be identified to be cleaned after use.

#### Resource Command Specifications

Resource command specifications are the definition of resource commands
in master definitions. The following commands for resources are:

- Acquire -- Identifies a resource to be acquired before the step can
  continue.

  - Example: Acquire *Mixer*

- Release -- Identifies a resource to be released.

  - Example: Release *Mixer*

- Acquire Pool Amount -- Identifies the amount of a resource to be
  acquired from a resource pool.

  - Example: Acquire 3 Bags from Bag Pool, returns IDs 123, 456,789

- Release Pool Amount -- Identifies the amount of a resource to be
  returned to the resource pool.

  - Example: Return 3 Bags to the Bag Pool, with IDs 123, 456, 789

#### Resource Commands

Resource commands are the definition of resource commands in runtime
definitions.

Resource Command behavior for steps:

- Acquire -- The step is put into the WAITING state until all the
  identified resources are acquired by the step.

  - Single Use Resource -

  - Resource Pool -- A local resource pool ID is returned for each
    resource acquired.

- Release -- When the step is COMPLETED all identified resources are
  released .

- Acquire Amount -- The step is put into the WAITING state until all
  identified resources are acquired at the requested amounts.

[^1]: Trajectory is the working name, a market name to be decided later

[^2]: There may be sequential, parallel or conditional actions in a
    workflow

[^3]: Users will be able to execute multiple workflows simultaneously,
    such as running a main course recipe and desert recipe at the same
    time, or running an exercise routine while also working on an
    expense report procedure.

[^4]: Additional types of actions are defined later
