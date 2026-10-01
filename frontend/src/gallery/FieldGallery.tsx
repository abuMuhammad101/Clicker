import type { ReactNode } from 'react'
import { BooleanField } from '@/fields/boolean/BooleanField'
import { BooleanListCell } from '@/fields/boolean/BooleanListCell'
import { DecimalField } from '@/fields/decimal/DecimalField'
import { DecimalListCell } from '@/fields/decimal/DecimalListCell'
import { EmailField } from '@/fields/email/EmailField'
import { EmailListCell } from '@/fields/email/EmailListCell'
import { LongtextField } from '@/fields/longtext/LongtextField'
import { LongtextListCell } from '@/fields/longtext/LongtextListCell'
import { ManyToOneField } from '@/fields/many-to-one/ManyToOneField'
import { ManyToOneListCell } from '@/fields/many-to-one/ManyToOneListCell'
import { PhoneField } from '@/fields/phone/PhoneField'
import { PhoneListCell } from '@/fields/phone/PhoneListCell'
import { SelectionField } from '@/fields/selection/SelectionField'
import { SelectionListCell } from '@/fields/selection/SelectionListCell'
import { TextField } from '@/fields/text/TextField'
import { TextListCell } from '@/fields/text/TextListCell'
import { UrlField } from '@/fields/url/UrlField'
import { UrlListCell } from '@/fields/url/UrlListCell'
import './FieldGallery.css'

const TYPE_CHOICES = [
  { value: 'person', label: 'Person' },
  { value: 'company', label: 'Company' },
]

function TypeSection({
  type,
  source,
  children,
}: {
  type: string
  source: string
  children: ReactNode
}) {
  return (
    <section className="gallery__type">
      <div className="gallery__type-header">
        <span className="gallery__type-name">{type}</span>
        <span className="gallery__type-label">{source}</span>
      </div>
      {children}
    </section>
  )
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery__state">
      <div className="gallery__state-label">{label}</div>
      <div className="gallery__state-content">{children}</div>
    </div>
  )
}

function ListCellRow({
  filled,
  empty,
}: {
  filled: ReactNode
  empty: ReactNode
}) {
  return (
    <div className="gallery__list-row">
      <div className="gallery__list-row-label">Filled / empty</div>
      <div className="gallery__list-cells">
        <div className="gallery__list-cell-slot">{filled}</div>
        <div className="gallery__list-cell-slot">{empty}</div>
      </div>
    </div>
  )
}

const noop = () => {}

export function FieldGallery() {
  return (
    <div className="gallery">
      <div className="gallery__intro">
        <h1>Field component gallery</h1>
        <p>
          Every registry type Contacts uses, form component and list cell, in every state. Dev-only
          — not part of the schema-driven renderer.
        </p>
      </div>

      <TypeSection type="text" source="Contact.name">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <TextField name="text-default" label="Name" value={null} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <TextField name="text-focused" label="Name" value={null} onChange={noop} forceFocused />
            </StateRow>
            <StateRow label="Filled">
              <TextField name="text-filled" label="Name" value="Acme Corporation" onChange={noop} />
            </StateRow>
            <StateRow label="Disabled">
              <TextField
                name="text-disabled"
                label="Name"
                value="Acme Corporation"
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <TextField
                name="text-readonly"
                label="Name"
                value="Acme Corporation"
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <TextField
                name="text-error"
                label="Name"
                value="Acme Corp"
                error="A contact with this name already exists."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <TextField name="text-required" label="Name" value={null} required onChange={noop} />
            </StateRow>
            <StateRow label="Loading">
              <TextField name="text-loading" label="Name" value={null} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<TextListCell value="Acme Corporation" />}
            empty={<TextListCell value={null} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="longtext" source="Contact.notes">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <LongtextField name="longtext-default" label="Notes" value={null} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <LongtextField
                name="longtext-focused"
                label="Notes"
                value={null}
                onChange={noop}
                forceFocused
              />
            </StateRow>
            <StateRow label="Filled">
              <LongtextField
                name="longtext-filled"
                label="Notes"
                value={'Prefers email over phone.\nBilling contact is Priya Shah, not the primary contact.'}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <LongtextField
                name="longtext-disabled"
                label="Notes"
                value="Prefers email over phone."
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <LongtextField
                name="longtext-readonly"
                label="Notes"
                value={'Prefers email over phone.\nBilling contact is Priya Shah.'}
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <LongtextField
                name="longtext-error"
                label="Notes"
                value={'x'.repeat(2100)}
                error="Notes must be under 2,000 characters."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <LongtextField
                name="longtext-required"
                label="Notes"
                value={null}
                required
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Loading">
              <LongtextField name="longtext-loading" label="Notes" value={null} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={
              <LongtextListCell value={'Prefers email over phone.\nBilling contact is Priya Shah.'} />
            }
            empty={<LongtextListCell value={null} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="selection" source="Contact.type">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <SelectionField
                name="selection-default"
                label="Type"
                value={null}
                choices={TYPE_CHOICES}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Focused">
              <SelectionField
                name="selection-focused"
                label="Type"
                value={null}
                choices={TYPE_CHOICES}
                onChange={noop}
                forceFocused
              />
            </StateRow>
            <StateRow label="Filled">
              <SelectionField
                name="selection-filled"
                label="Type"
                value="company"
                choices={TYPE_CHOICES}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <SelectionField
                name="selection-disabled"
                label="Type"
                value="company"
                choices={TYPE_CHOICES}
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <SelectionField
                name="selection-readonly"
                label="Type"
                value="company"
                choices={TYPE_CHOICES}
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <SelectionField
                name="selection-error"
                label="Type"
                value={null}
                choices={TYPE_CHOICES}
                error="Type is required."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <SelectionField
                name="selection-required"
                label="Type"
                value={null}
                choices={TYPE_CHOICES}
                required
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Loading">
              <SelectionField
                name="selection-loading"
                label="Type"
                value={null}
                choices={TYPE_CHOICES}
                loading
                onChange={noop}
              />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<SelectionListCell value="company" choices={TYPE_CHOICES} />}
            empty={<SelectionListCell value={null} choices={TYPE_CHOICES} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="boolean" source="Contact.is_customer">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <BooleanField name="boolean-default" label="Customer" value={false} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <BooleanField
                name="boolean-focused"
                label="Customer"
                value={false}
                onChange={noop}
                forceFocused
              />
            </StateRow>
            <StateRow label="Filled">
              <BooleanField name="boolean-filled" label="Customer" value={true} onChange={noop} />
            </StateRow>
            <StateRow label="Disabled">
              <BooleanField
                name="boolean-disabled"
                label="Customer"
                value={true}
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <BooleanField
                name="boolean-readonly"
                label="Customer"
                value={true}
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <BooleanField
                name="boolean-error"
                label="Customer"
                value={false}
                error="Cannot be a customer without a billing address."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <span className="gallery__na">
                Not applicable — a checkbox is always true or false, never empty.
              </span>
            </StateRow>
            <StateRow label="Loading">
              <BooleanField name="boolean-loading" label="Customer" value={false} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<BooleanListCell value={true} />}
            empty={<BooleanListCell value={false} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="email" source="Contact.email">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <EmailField name="email-default" label="Email" value={null} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <EmailField name="email-focused" label="Email" value={null} onChange={noop} forceFocused />
            </StateRow>
            <StateRow label="Filled">
              <EmailField
                name="email-filled"
                label="Email"
                value="hello@acme.example.com"
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <EmailField
                name="email-disabled"
                label="Email"
                value="hello@acme.example.com"
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <EmailField
                name="email-readonly"
                label="Email"
                value="hello@acme.example.com"
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <EmailField
                name="email-error"
                label="Email"
                value="not-an-email"
                error="Enter a valid email address."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <EmailField name="email-required" label="Email" value={null} required onChange={noop} />
            </StateRow>
            <StateRow label="Loading">
              <EmailField name="email-loading" label="Email" value={null} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<EmailListCell value="hello@acme.example.com" />}
            empty={<EmailListCell value={null} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="phone" source="Contact.phone">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <PhoneField name="phone-default" label="Phone" value={null} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <PhoneField name="phone-focused" label="Phone" value={null} onChange={noop} forceFocused />
            </StateRow>
            <StateRow label="Filled">
              <PhoneField name="phone-filled" label="Phone" value="+1 415 555 0100" onChange={noop} />
            </StateRow>
            <StateRow label="Disabled">
              <PhoneField
                name="phone-disabled"
                label="Phone"
                value="+1 415 555 0100"
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <PhoneField
                name="phone-readonly"
                label="Phone"
                value="+1 415 555 0100"
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <PhoneField
                name="phone-error"
                label="Phone"
                value="555"
                error="Enter a complete phone number."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <PhoneField name="phone-required" label="Phone" value={null} required onChange={noop} />
            </StateRow>
            <StateRow label="Loading">
              <PhoneField name="phone-loading" label="Phone" value={null} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<PhoneListCell value="+1 415 555 0100" />}
            empty={<PhoneListCell value={null} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="url" source="Contact.website">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <UrlField name="url-default" label="Website" value={null} onChange={noop} />
            </StateRow>
            <StateRow label="Focused">
              <UrlField name="url-focused" label="Website" value={null} onChange={noop} forceFocused />
            </StateRow>
            <StateRow label="Filled">
              <UrlField
                name="url-filled"
                label="Website"
                value="https://acme.example.com/about/company-history-and-leadership"
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <UrlField
                name="url-disabled"
                label="Website"
                value="https://acme.example.com"
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <UrlField
                name="url-readonly"
                label="Website"
                value="https://acme.example.com/about/company-history-and-leadership"
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <UrlField
                name="url-error"
                label="Website"
                value="not a url"
                error="Enter a valid URL."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <UrlField name="url-required" label="Website" value={null} required onChange={noop} />
            </StateRow>
            <StateRow label="Loading">
              <UrlField name="url-loading" label="Website" value={null} loading onChange={noop} />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={
              <UrlListCell value="https://acme.example.com/about/company-history-and-leadership" />
            }
            empty={<UrlListCell value={null} />}
          />
        </div>
      </TypeSection>

      <TypeSection type="decimal" source="Product.sales_price (max_digits=10, decimal_places=2)">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <DecimalField
                name="decimal-default"
                label="Sales price"
                value={null}
                maxDigits={10}
                decimalPlaces={2}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Focused">
              <DecimalField
                name="decimal-focused"
                label="Sales price"
                value={1234.5}
                maxDigits={10}
                decimalPlaces={2}
                onChange={noop}
                forceFocused
              />
            </StateRow>
            <StateRow label="Filled">
              <DecimalField
                name="decimal-filled"
                label="Sales price"
                value={1234.5}
                maxDigits={10}
                decimalPlaces={2}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <DecimalField
                name="decimal-disabled"
                label="Sales price"
                value={1234.5}
                maxDigits={10}
                decimalPlaces={2}
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <DecimalField
                name="decimal-readonly"
                label="Sales price"
                value={1234.5}
                maxDigits={10}
                decimalPlaces={2}
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <DecimalField
                name="decimal-error"
                label="Sales price"
                value={99999999999}
                maxDigits={10}
                decimalPlaces={2}
                error="Sales price exceeds 10 digits."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <DecimalField
                name="decimal-required"
                label="Sales price"
                value={null}
                maxDigits={10}
                decimalPlaces={2}
                required
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Loading">
              <DecimalField
                name="decimal-loading"
                label="Sales price"
                value={null}
                maxDigits={10}
                decimalPlaces={2}
                loading
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Negative (distinct)">
              <DecimalField
                name="decimal-negative"
                label="Cost adjustment"
                value={-42.5}
                maxDigits={10}
                decimalPlaces={2}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Zero, not empty">
              <DecimalField
                name="decimal-zero"
                label="Cost"
                value={0}
                maxDigits={10}
                decimalPlaces={2}
                onChange={noop}
              />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<DecimalListCell value={1234.5} decimalPlaces={2} />}
            empty={<DecimalListCell value={null} decimalPlaces={2} />}
          />
          <div className="gallery__list-row" style={{ marginTop: 'var(--space-3)' }}>
            <div className="gallery__list-row-label">Negative / zero</div>
            <div className="gallery__list-cells">
              <div className="gallery__list-cell-slot">
                <DecimalListCell value={-42.5} decimalPlaces={2} />
              </div>
              <div className="gallery__list-cell-slot">
                <DecimalListCell value={0} decimalPlaces={2} />
              </div>
            </div>
          </div>
        </div>
      </TypeSection>

      <TypeSection type="many_to_one" source="Contact.parent → Contact, domain: type=company">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Form states</h3>
          <div className="gallery__states">
            <StateRow label="Default">
              <ManyToOneField
                name="m2o-default"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                helpText="Must be a company. Leave blank for a standalone contact."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Focused">
              <ManyToOneField
                name="m2o-focused"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                onChange={noop}
                forceFocused
              />
            </StateRow>
            <StateRow label="Filled">
              <ManyToOneField
                name="m2o-filled"
                label="Parent"
                value={1}
                displayValue="Acme Corporation"
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Disabled">
              <ManyToOneField
                name="m2o-disabled"
                label="Parent"
                value={1}
                displayValue="Acme Corporation"
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                disabled
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Readonly">
              <ManyToOneField
                name="m2o-readonly"
                label="Parent"
                value={1}
                displayValue="Acme Corporation"
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                readOnly
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Error">
              <ManyToOneField
                name="m2o-error"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                error="This contact no longer exists."
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Required + empty">
              <ManyToOneField
                name="m2o-required"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                required
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Loading (value not yet loaded)">
              <ManyToOneField
                name="m2o-loading"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                loading
                onChange={noop}
              />
            </StateRow>
            <StateRow label="Search open (live)">
              <ManyToOneField
                name="m2o-search"
                label="Parent"
                value={null}
                target={{ app_label: 'core', model: 'contact' }}
                domain={{ type: 'company' }}
                forceOpen
                onChange={noop}
              />
            </StateRow>
          </div>
        </div>
        <div className="gallery__section">
          <h3 className="gallery__section-title">List cell</h3>
          <ListCellRow
            filled={<ManyToOneListCell label="Acme Corporation" />}
            empty={<ManyToOneListCell label={null} />}
          />
        </div>
      </TypeSection>
    </div>
  )
}
