import type { RecipientType, ReminderAnchor, ReminderRuleType } from "./types";

export type SeedRecipient = {
  email: string;
  type: RecipientType;
  reminders: boolean;
  statusUpdates: boolean;
  invoice?: boolean;
  approval?: boolean;
  payment?: boolean;
  overdue?: boolean;
  paid?: boolean;
};

const SANDEEP = "sandeep.lohani@doubletick.io";
const BHUMIK = "bhumik@quicksell.co";
const NISHANT = "nishant@quicksell.co";
const FINANCE = "finance@quicksell.co";
const JATIN = "jatin.tank@quicksell.co";
const VATSAL = "vatsal.shah@doubletick.com";

function to(
  email: string,
  flags: {
    invoice?: boolean;
    approval?: boolean;
    payment?: boolean;
    overdue?: boolean;
    paid?: boolean;
    status?: boolean;
  },
): SeedRecipient {
  const invoice = flags.invoice ?? false;
  const approval = flags.approval ?? false;
  const payment = flags.payment ?? false;
  const overdue = flags.overdue ?? false;
  const paid = flags.paid ?? false;
  return {
    email,
    type: "to",
    reminders: invoice || payment || overdue || paid,
    statusUpdates: flags.status ?? false,
    invoice,
    approval,
    payment,
    overdue,
    paid,
  };
}

export type SeedBill = {
  name: string;
  provider: string;
  category: string;
  accountNumber?: string;
  arrivalStartDay: number;
  arrivalEndDay: number;
  paymentTargetDay: number;
  paymentDeadlineDay: number;
  notes?: string;
  recipients: SeedRecipient[];
  rules: {
    ruleType: ReminderRuleType;
    label: string;
    dayOfMonth: number | null;
    offsetDays: number | null;
    anchor: ReminderAnchor | null;
  }[];
};

function standardRules(arrivalEnd: number, target: number, deadline: number) {
  return [
    {
      ruleType: "invoice_arrival" as const,
      label: "Invoice arrival check",
      dayOfMonth: arrivalEnd,
      offsetDays: null,
      anchor: null,
    },
    {
      ruleType: "payment_pending" as const,
      label: "Payment reminder (3 days before deadline)",
      dayOfMonth: null,
      offsetDays: -3,
      anchor: "payment_deadline" as const,
    },
    {
      ruleType: "payment_pending" as const,
      label: "Payment target reminder",
      dayOfMonth: target,
      offsetDays: null,
      anchor: null,
    },
    {
      ruleType: "overdue" as const,
      label: "Overdue escalation",
      dayOfMonth: deadline,
      offsetDays: null,
      anchor: null,
    },
    {
      ruleType: "payment_paid" as const,
      label: "Paid confirmation",
      dayOfMonth: null,
      offsetDays: null,
      anchor: null,
    },
  ];
}

export const TATA_ACCOUNT_NUMBERS = [
  "991801663",
  "991795281",
  "991801197",
  "991801099",
  "991800981",
];

function tataBill(accountNumber: string): SeedBill {
  return {
    name: `Tata ${accountNumber}`,
    provider: "Tata",
    category: "Telecom",
    accountNumber,
    arrivalStartDay: 1,
    arrivalEndDay: 10,
    paymentTargetDay: 18,
    paymentDeadlineDay: 20,
    recipients: [
      to(NISHANT, { invoice: true, status: true }),
      to(FINANCE, { invoice: true, status: true }),
      to(SANDEEP, { invoice: true, approval: true, overdue: true, paid: true, status: true }),
      to(JATIN, { payment: true, overdue: true, status: true }),
    ],
    rules: standardRules(10, 18, 20),
  };
}

const RAW_SEED_BILLS: SeedBill[] = [
  {
    name: "Attendance Server",
    provider: "Attendance Server",
    category: "Software",
    arrivalStartDay: 2,
    arrivalEndDay: 4,
    paymentTargetDay: 6,
    paymentDeadlineDay: 8,
    notes: "Monthly attendance infrastructure invoice.",
    recipients: [
      to(SANDEEP, {
        invoice: true,
        approval: true,
        payment: true,
        overdue: true,
        paid: true,
        status: true,
      }),
    ],
    rules: standardRules(4, 6, 8),
  },
  {
    name: "Jio",
    provider: "Jio",
    category: "Telecom",
    arrivalStartDay: 2,
    arrivalEndDay: 5,
    paymentTargetDay: 3,
    paymentDeadlineDay: 5,
    recipients: [
      to(NISHANT, { invoice: true, status: true }),
      to(SANDEEP, {
        invoice: true,
        approval: true,
        payment: true,
        overdue: true,
        paid: true,
        status: true,
      }),
    ],
    rules: standardRules(5, 3, 5),
  },
  {
    name: "VI",
    provider: "Vodafone Idea",
    category: "Telecom",
    arrivalStartDay: 2,
    arrivalEndDay: 4,
    paymentTargetDay: 5,
    paymentDeadlineDay: 8,
    recipients: [
      to(FINANCE, { invoice: true, status: true }),
      to(SANDEEP, { invoice: true, approval: true, overdue: true, paid: true, status: true }),
      to(JATIN, { payment: true, overdue: true, status: true }),
    ],
    rules: standardRules(4, 5, 8),
  },
  ...TATA_ACCOUNT_NUMBERS.map(tataBill),
  {
    name: "Airtel Mobile",
    provider: "Airtel",
    category: "Mobile",
    arrivalStartDay: 15,
    arrivalEndDay: 20,
    paymentTargetDay: 22,
    paymentDeadlineDay: 30,
    notes: "Deadline window is broad (16th-30th). Internal target is the 22nd.",
    recipients: [
      to(BHUMIK, { invoice: true, status: true }),
      to(SANDEEP, {
        invoice: true,
        approval: true,
        payment: true,
        overdue: true,
        paid: true,
        status: true,
      }),
      to(JATIN, { payment: true, overdue: true, status: true }),
    ],
    rules: standardRules(20, 22, 30),
  },
  {
    name: "Airtel BND",
    provider: "Airtel",
    category: "Broadband",
    arrivalStartDay: 2,
    arrivalEndDay: 20,
    paymentTargetDay: 15,
    paymentDeadlineDay: 31,
    notes:
      "Billing timing varies: the invoice usually arrives 2nd-10th (due 15th-20th) or 15th-20th (due by month-end). Internal target is the 15th; final deadline is month-end.",
    recipients: [
      to(BHUMIK, { invoice: true, status: true }),
      to(SANDEEP, {
        invoice: true,
        approval: true,
        payment: true,
        overdue: true,
        paid: true,
        status: true,
      }),
      to(JATIN, { payment: true, overdue: true, status: true }),
    ],
    rules: standardRules(20, 15, 31),
  },
  {
    name: "Shivam Recharge",
    provider: "Shivam",
    category: "Recharge",
    arrivalStartDay: 15,
    arrivalEndDay: 18,
    paymentTargetDay: 23,
    paymentDeadlineDay: 25,
    notes: "Usually recharged 7-10 days before the 25th.",
    recipients: [
      to(SANDEEP, { invoice: true, approval: true, overdue: true, paid: true, status: true }),
      to(JATIN, { payment: true, overdue: true, status: true }),
    ],
    rules: standardRules(18, 23, 25),
  },
  {
    name: "Shivami",
    provider: "Shivami",
    category: "Telecom",
    arrivalStartDay: 2,
    arrivalEndDay: 4,
    paymentTargetDay: 4,
    paymentDeadlineDay: 5,
    recipients: [
      to(FINANCE, { invoice: true, payment: true, overdue: true, paid: true, status: true }),
      to(SANDEEP, { invoice: true, approval: true, overdue: true, status: true }),
    ],
    rules: standardRules(4, 4, 5),
  },
  {
    name: "NetworkTech Lab",
    provider: "NetworkTech Lab",
    category: "Laptop Rental",
    arrivalStartDay: 20,
    arrivalEndDay: 25,
    paymentTargetDay: 27,
    paymentDeadlineDay: 31,
    notes: "Laptop rental invoice is raised 20th-25th and must be cleared before month-end.",
    recipients: [
      to(SANDEEP, { invoice: true, overdue: true, status: true }),
      to(VATSAL, { invoice: true, approval: true, overdue: true, status: true }),
      to(BHUMIK, { invoice: true, payment: true, overdue: true, paid: true, status: true }),
    ],
    rules: standardRules(25, 27, 31),
  },
  {
    name: "ABCom",
    provider: "ABCom",
    category: "Laptop Rental",
    arrivalStartDay: 2,
    arrivalEndDay: 4,
    paymentTargetDay: 4,
    paymentDeadlineDay: 5,
    notes: "Laptop rental invoice arrives 2nd-4th and is due on the 5th.",
    recipients: [
      to(BHUMIK, { invoice: true, payment: true, overdue: true, paid: true, status: true }),
      to(SANDEEP, { invoice: true, approval: true, overdue: true, status: true }),
    ],
    rules: standardRules(4, 4, 5),
  },
  {
    name: "Office Boy Payment",
    provider: "Office Boy",
    category: "Office Services",
    arrivalStartDay: 1,
    arrivalEndDay: 1,
    paymentTargetDay: 1,
    paymentDeadlineDay: 1,
    notes: "Monthly office boy payment, due on the 1st. Sandeep verifies, Bhumik pays and confirms.",
    recipients: [
      {
        email: "sandeep.lohani@doubletick.io",
        type: "to",
        reminders: true,
        statusUpdates: true,
        invoice: true,
        approval: true,
        payment: false,
        overdue: true,
        paid: false,
      },
      {
        email: "bhumik@quicksell.co",
        type: "to",
        reminders: true,
        statusUpdates: true,
        invoice: false,
        payment: true,
        overdue: true,
        paid: true,
      },
    ],
    rules: [
      {
        ruleType: "invoice_arrival",
        label: "Monthly payment check",
        dayOfMonth: 1,
        offsetDays: null,
        anchor: null,
      },
      {
        ruleType: "payment_pending",
        label: "Payment reminder",
        dayOfMonth: 1,
        offsetDays: null,
        anchor: null,
      },
      {
        ruleType: "overdue",
        label: "Overdue escalation",
        dayOfMonth: 2,
        offsetDays: null,
        anchor: null,
      },
      {
        ruleType: "payment_paid",
        label: "Paid confirmation",
        dayOfMonth: null,
        offsetDays: null,
        anchor: null,
      },
    ],
  },
];

const PAID_STATUS_AUDIENCE = [SANDEEP, NISHANT];

function ensurePaidStatusAudience(bill: SeedBill): SeedBill {
  const recipients = bill.recipients.map((recipient) => ({ ...recipient }));
  for (const email of PAID_STATUS_AUDIENCE) {
    const existing = recipients.find((recipient) => recipient.email === email);
    if (existing) {
      existing.paid = true;
      existing.statusUpdates = true;
      continue;
    }
    recipients.push({
      email,
      type: "to",
      reminders: true,
      statusUpdates: true,
      invoice: false,
      approval: false,
      payment: false,
      overdue: false,
      paid: true,
    });
  }
  return { ...bill, recipients };
}

export const SEED_BILLS: SeedBill[] = RAW_SEED_BILLS.map(ensurePaidStatusAudience);
