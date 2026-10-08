"use client";

import {
    useEffect,
    useRef,
    useState,
} from "react";

import {
    Check,
    ChevronDown,
} from "lucide-react";

import "./FilterDropdown.css";

export type FilterDropdownOption<T extends string = string> = {
    value: T;
    label: string;
    dividerBefore?: boolean;
};

type FilterDropdownProps<T extends string = string> = {
    value: T;
    options: FilterDropdownOption<T>[];
    onChange: (value: T) => void;
    className?: string;
};

export default function FilterDropdown<
    T extends string = string
>({
    value,
    options,
    onChange,
    className = "",
}: FilterDropdownProps<T>) {

    const [open, setOpen] = useState(false);
    const dropdownRef =  useRef<HTMLDivElement>(null);
    const selectedOption = options.find(
        (option) => option.value === value
    ) ?? options[0];

    useEffect(() => {
        function handleOutsideClick(
        event: MouseEvent
        ) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(
                    event.target as Node
                )
            ) {
                setOpen(false);
            }
        }

        function handleEscape(
            event: KeyboardEvent
        ) {
            if (event.key === "Escape") {
                setOpen(false);
            }
        }

        document.addEventListener(
            "mousedown",
            handleOutsideClick
        );
        document.addEventListener(
            "keydown",
            handleEscape
        );
        return () => {
            document.removeEventListener(
                "mousedown",
                handleOutsideClick
            );

            document.removeEventListener(
                "keydown",
                handleEscape
            );
        };

    }, []);

    function selectOption(option: FilterDropdownOption<T>) {
        onChange(option.value);
        setOpen(false);
    }

    return (
        <div
            ref={dropdownRef}
            className={`filter-dropdown ${className}`}
        >
            <button
                type="button"
                className={`filter-dropdown-trigger ${
                    open ? "open" : ""
                }`}
                onClick={() =>
                    setOpen((previous) => !previous)
                }
                aria-expanded={open}
            >
                <span className="filter-dropdown-label">
                    {selectedOption?.label}
                </span>

                <ChevronDown
                    size={16}
                    className={`filter-dropdown-chevron ${
                        open ? "open" : ""
                    }`}
                />
            </button>

            {open && (
                <div className="filter-dropdown-menu">
                    {options.map((option) => {
                        const selected =
                        option.value === value;

                        return (
                            <div
                                key={option.value}
                                className={
                                option.dividerBefore
                                    ? "filter-dropdown-option-wrap with-divider"
                                    : "filter-dropdown-option-wrap"
                                }
                            >
                                <button
                                    type="button"
                                    className={`filter-dropdown-option ${
                                        selected ? "selected" : ""
                                    }`}
                                    onClick={() =>
                                        selectOption(option)
                                    }
                                >
                                    <span className="filter-dropdown-check">
                                        {selected && (
                                        <Check size={15} />
                                        )}
                                    </span>

                                    <span>
                                        {option.label}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}