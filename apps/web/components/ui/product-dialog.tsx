"use client";
import {ProductIcon} from "./product-icon";
import {useEffect, useId, useRef, type ReactNode} from "react";

/** Presentation only. Closing never changes controller or recovery state. */
export function ProductDialog({open,title,onClose,children,footer}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const origin = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element.showModal();
    return () => {
      element.close();
      if (origin?.isConnected) origin.focus();
    };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className="product-dialog" aria-labelledby={titleId}
    onCancel={event => {event.preventDefault(); close.current();}}
    onClick={event => {if (event.target === event.currentTarget) close.current();}}>
    <header className="product-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}><ProductIcon name="close"/></button></header>
    <div className="product-dialog-body">{children}</div>
    {footer&&<footer className="product-dialog-footer">{footer}</footer>}
  </dialog>;
}
