import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let simpleMode = true;

vi.mock("@core/hooks/useSimpleMode.ts", () => ({
  useSimpleMode: () => simpleMode,
}));

import { DynamicForm } from "./DynamicForm.tsx";

interface SampleValues {
  basic: string;
  advanced: string;
}

const defaultGroups = [
  {
    label: "Group A",
    description: "A description",
    fields: [
      {
        type: "text" as const,
        name: "basic" as const,
        label: "Basic Field",
        description: "always visible",
      },
      {
        type: "text" as const,
        name: "advanced" as const,
        label: "Advanced Field",
        description: "advanced only",
        visibility: "advanced" as const,
      },
    ],
  },
  {
    label: "Group B (advanced)",
    description: "advanced group",
    visibility: "advanced" as const,
    fields: [
      {
        type: "text" as const,
        name: "basic" as const,
        label: "Hidden in simple",
        description: "advanced group field",
      },
    ],
  },
];

describe("DynamicForm visibility", () => {
  beforeEach(() => {
    simpleMode = true;
  });

  it("hides advanced fields and groups when simpleMode=true", () => {
    render(
      <DynamicForm<SampleValues>
        onSubmit={() => {}}
        defaultValues={{ basic: "", advanced: "" }}
        fieldGroups={defaultGroups}
      />,
    );
    expect(screen.getByText("Basic Field")).toBeInTheDocument();
    expect(screen.queryByText("Advanced Field")).not.toBeInTheDocument();
    expect(screen.queryByText("Group B (advanced)")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden in simple")).not.toBeInTheDocument();
  });

  it("shows everything when simpleMode=false", () => {
    simpleMode = false;
    render(
      <DynamicForm<SampleValues>
        onSubmit={() => {}}
        defaultValues={{ basic: "", advanced: "" }}
        fieldGroups={defaultGroups}
      />,
    );
    expect(screen.getByText("Basic Field")).toBeInTheDocument();
    expect(screen.getByText("Advanced Field")).toBeInTheDocument();
    expect(screen.getByText("Group B (advanced)")).toBeInTheDocument();
    expect(screen.getByText("Hidden in simple")).toBeInTheDocument();
  });

  it("hides a group entirely when all of its fields are advanced and simpleMode=true", () => {
    simpleMode = true;
    const allAdvancedGroup = [
      {
        label: "All Advanced",
        description: "all fields advanced",
        fields: [
          {
            type: "text" as const,
            name: "basic" as const,
            label: "Adv Only",
            description: "x",
            visibility: "advanced" as const,
          },
        ],
      },
    ];
    render(
      <DynamicForm<SampleValues>
        onSubmit={() => {}}
        defaultValues={{ basic: "", advanced: "" }}
        fieldGroups={allAdvancedGroup}
      />,
    );
    // Group heading should not render because no fields are visible
    expect(screen.queryByText("All Advanced")).not.toBeInTheDocument();
  });
});
