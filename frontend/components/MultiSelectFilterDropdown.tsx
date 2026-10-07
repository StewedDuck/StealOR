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

import "./MultiSelectFilterDropdown.css";

export type MultiSelectOption<T extends string = string> = {
    value: T;
    label: string;
};

type MultiSelectFilterDropdownProps<T extends string = string> = {
    values: T[];
    options: MultiSelectOption<T>[];
    onChange: (values: T[]) => void;
    placeholder?: string;
};


export default function MultiSelectFilterDropdown<T extends string = string>({
    values,
    options,
    onChange,
    placeholder = "ประเภทเอกสาร",
}: MultiSelectFilterDropdownProps<T>) {

    const [open, setOpen] = useState(false);
    const dropdownRef =  useRef<HTMLDivElement>(null);

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

    function toggleOption(
        value: T
    ) {
        if (values.includes(value)) {
            onChange(
                values.filter(
                (item) => item !== value
                )
            );
            return;
        }

        onChange([
            ...values,
            value,
        ]);
    }

    function getTriggerLabel() {
        if (values.length === 0) {
            return placeholder;
        }
        if (values.length === 1) {
        const selected =
            options.find(
            (option) =>
                option.value === values[0]
            );
            return (
                selected?.label ??
                placeholder
            );
        }
        return `${placeholder} (${values.length})`;
    }

    return (
        <div
            ref={dropdownRef}
            className="multi-filter-dropdown"
        >

            <button
                type="button"
                className={`multi-filter-trigger ${
                    open ? "open" : ""
                }`}
                onClick={() =>
                    setOpen(
                        (previous) => !previous
                    )
                }
                aria-expanded={open}
            >
                <span className="multi-filter-trigger-label">
                    {getTriggerLabel()}
                </span>

                <ChevronDown
                    size={16}
                    className={`multi-filter-chevron ${
                        open ? "open" : ""
                    }`}
                />
            </button>


            {open && (
                <div className="multi-filter-menu">

                    {options.map(
                        (option) => {

                            const selected = values.includes(option.value);

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`multi-filter-option ${
                                        selected
                                        ? "selected"
                                        : ""
                                    }`}
                                    onClick={() =>
                                        toggleOption(
                                        option.value
                                        )
                                    }
                                >
                                    <span className="multi-filter-checkbox">
                                        {selected && (<Check size={13} />)}
                                    </span>

                                    <span className="multi-filter-option-label">
                                        {option.label}
                                    </span>
                                    
                                </button>
                            );
                        }
                    )}
                </div>
            )}
        </div>
    );
}