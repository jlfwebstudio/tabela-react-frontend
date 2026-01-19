import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);

  const filterDropdownRef = useRef(null);
  const filterButtonRefs = useRef({}); // Para fechar o dropdown ao clicar em outro botão de filtro

  // Define os cabeçalhos da tabela na ordem desejada
  const defaultTableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Normaliza strings para comparação (remove acentos, caixa baixa, e caracteres especiais)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
  }, []);

  // Função para parsear datas de forma robusta para comparação
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;

    // Tenta DD/MM/YYYY
    let parts = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (parts) {
      return new Date(parts[3], parts[2] - 1, parts[1]);
    }

    // Tenta YYYY-MM-DD (se houver algum caso)
    parts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
      return new Date(parts[1], parts[2] - 1, parts[3]);
    }

    // Fallback para parser nativo (menos confiável, mas pode pegar outros formatos)
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Função para formatar datas para exibição na tabela
  const formatDataLimite = useCallback((dateString) => {
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna o original se não conseguir parsear
  }, [parseDateForComparison]);

  // Lógica para verificar se a OS está atrasada
  const isOverdue = useCallback((dateString) => {
    const limitDate = parseDateForComparison(dateString);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return limitDate.getTime() < today.getTime();
  }, [parseDateForComparison]);

  // Lógica para verificar se a OS vence hoje
  const isDueToday = useCallback((dateString) => {
    const limitDate = parseDateForComparison(dateString);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return limitDate.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Lógica para a condição "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const status = normalizeForComparison(row['Status']);
    const dataLimite = row['Data Limite'];

    const isAtrasada = isOverdue(dataLimite);
    const justificativaVaziaOuFaltaAbonar = justificativa === '' || justificativa === 'faltaabonar';

    // Condição: OS em atraso E justificativa vazia ou "falta abonar"
    return isAtrasada && justificativaVaziaOuFaltaAbonar;
  }, [isOverdue, normalizeForComparison]);

  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: 'white',
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isAbonarCondition]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isAbonarCondition]);

  // Classe da linha para cores condicionais na tabela web
  const getRowClass = useCallback((row) => {
    if (isAbonarCondition(row)) {
      // Se for "FALTA ABONAR", a linha fica vermelha (atrasada)
      // A célula individual de justificativa já será roxa.
      return 'row-overdue'; // Mantém a linha vermelha para atraso
    }
    if (isOverdue(row['Data Limite'])) {
      return 'row-overdue'; // Vermelho para atrasado
    }
    if (isDueToday(row['Data Limite'])) {
      return 'row-due-today'; // Amarelo para hoje
    }
    // Azul clarinho para prazo maior que hoje (default)
    return 'row-default-blue';
  }, [isOverdue, isDueToday, isAbonarCondition]);

  // Contador de pendências (atrasadas ou vencendo hoje)
  const overdueCount = useMemo(() => {
    return data.filter(row => isOverdue(row['Data Limite']) || isDueToday(row['Data Limite'])).length;
  }, [data, isOverdue, isDueToday]);

  // Função para lidar com o upload do arquivo
  const handleUpload = useCallback(async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) {
      setError('Nenhum arquivo selecionado.');
      return;
    }
    setFile(uploadedFile);
    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders([]);
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    }); // Resetar filtros ao carregar novo arquivo

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao carregar o arquivo.');
      }

      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders); // Usar cabeçalhos definidos
        // Gerar opções de filtro dinamicamente
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(row => String(row[header] || '').trim()))].sort();
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);
      } else {
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, defaultTableHeaders]);

  // Função para lidar com a mudança no termo de busca
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prevDirection => (prevDirection === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prevColumn => (prevColumn === column ? null : column));
  }, []);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prevSelected => {
      const currentOptions = prevSelected[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prevSelected,
          [header]: currentOptions.filter(item => item !== option),
        };
      } else {
        return {
          ...prevSelected,
          [header]: [...currentOptions, option],
        };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna (fechar dropdown)
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null);
  }, []);

  // Função para limpar o filtro de uma coluna
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prevSelected => ({
      ...prevSelected,
      [header]: [],
    }));
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum botão de filtro
        const clickedOnFilterButton = Object.values(filterButtonRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterButton) {
          setActiveFilterColumn(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data.filter(row => {
      // Filtro por termo de busca
      const matchesSearch = searchTerm === '' ||
        Object.values(row).some(value =>
          normalizeForComparison(String(value)).includes(normalizeForComparison(searchTerm))
        );

      // Filtro por opções selecionadas
      const matchesFilters = Object.keys(selectedFilterOptions).every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        return selectedOptions.includes(String(row[header] || '').trim());
      });

      return matchesSearch && matchesFilters;
    });

    // Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          // Lida com datas inválidas ou nulas, colocando-as no final
          if (dateA && !dateB) return sortDirection === 'asc' ? -1 : 1;
          if (!dateA && dateB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }

        // Ordenação padrão para outros tipos
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    // Filtrar apenas as pendências de hoje (atrasadas ou vencendo hoje)
    const dataToExport = data.filter(row => isOverdue(row['Data Limite']) || isDueToday(row['Data Limite']));

    if (dataToExport.length === 0) {
      alert('Não há pendências para exportar.');
      return;
    }

    const ws_data = [tableHeaders]; // Cabeçalhos na primeira linha

    dataToExport.forEach(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        let value = row[header];

        // Lógica para "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && isAbonarCondition(row)) {
          value = 'FALTA ABONAR';
        }

        // Formatação de data para Excel
        if (header === 'Data Limite') {
          const date = parseDateForComparison(value);
          // Usar XLSX.utils.date_to_num para converter para o formato numérico do Excel
          newRow[header] = date && !isNaN(date.getTime()) ? XLSX.utils.date_to_num(date) : '';
        }
        // Limpeza de CNPJ/CPF
        else if (header === 'CNPJ / CPF') {
          newRow[header] = String(value || '').replace(/['"=]/g, '').trim();
        }
        else {
          newRow[header] = value;
        }
      });
      ws_data.push(Object.values(newRow)); // Adiciona os valores da linha na ordem dos cabeçalhos
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Definir larguras de coluna
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Chamado') width = 12;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Contratante') width = 15;
      else if (header === 'Serviço') width = 30; // Mais largo para nomes completos
      else if (header === 'Status') width = 15;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Cliente') width = 25;
      else if (header === 'CNPJ / CPF') width = 20; // Ligeiramente mais largo
      else if (header === 'Cidade') width = 15;
      else if (header === 'Técnico') width = 20;
      else if (header === 'Prestador') width = 20;
      else if (header === 'Justificativa do Abono') width = 25;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cellref = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (!ws[cellref]) ws[cellref] = { v: tableHeaders[C] };
      ws[cellref].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } }, // Azul escuro
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } },
        },
      };
    }

    // Estilos para as linhas de dados
    for (let R = 1; R <= dataToExport.length; ++R) {
      const rowData = dataToExport[R - 1]; // -1 porque R começa de 1
      const isRowOverdue = isOverdue(rowData['Data Limite']);
      const isRowDueToday = isDueToday(rowData['Data Limite']);
      const isRowAbonar = isAbonarCondition(rowData);

      let rowFillColor = "FFFFFF"; // Branco padrão
      if (isRowAbonar || isRowOverdue) {
        rowFillColor = "FF0000"; // Vermelho para atrasado (inclui FALTA ABONAR)
      } else if (isRowDueToday) {
        rowFillColor = "FFFF00"; // Amarelo para hoje
      } else {
        rowFillColor = "ADD8E6"; // Azul clarinho para prazo maior que hoje
      }

      for (let C = 0; C < tableHeaders.length; ++C) {
        const cellref = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellref]) ws[cellref] = { v: ws_data[R][C] }; // Garante que a célula existe

        // Estilo de borda para todas as células
        ws[cellref].s = {
          ...ws[cellref].s, // Mantém estilos existentes (como formatação de número)
          border: {
            top: { style: "thin", color: { auto: 1 } },
            bottom: { style: "thin", color: { auto: 1 } },
            left: { style: "thin", color: { auto: 1 } },
            right: { style: "thin", color: { auto: 1 } },
          },
          alignment: { vertical: "center" },
        };

        // Cor de fundo da linha
        ws[cellref].s.fill = { fgColor: { rgb: rowFillColor } };

        // Formatação de data para 'Data Limite'
        if (tableHeaders[C] === 'Data Limite' && ws[cellref].v !== '') {
          ws[cellref].t = 'n'; // Tipo número para datas
          ws[cellref].z = 'DD/MM/YYYY'; // Formato de exibição
        }

        // Estilo especial para "Justificativa do Abono" se for "FALTA ABONAR"
        if (tableHeaders[C] === 'Justificativa do Abono' && isRowAbonar) {
          ws[cellref].s.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          ws[cellref].s.font = { bold: true, color: { rgb: "FFFFFF" } }; // Texto branco e negrito
        }
      }
    }

    // Adicionar autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ c: tableHeaders.length - 1, r: dataToExport.length })}` };

    // Congelar painéis (primeira linha e primeira coluna)
    ws['!freeze'] = { xf: 0, yf: 1, xSplit: 0, ySplit: 1, activePane: 'bottomLeft', sqref: 'A2' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias Hoje');
    XLSX.writeFile(wb, 'pendencias_hoje.xlsx');
  }, [data, tableHeaders, isOverdue, isDueToday, isAbonarCondition, parseDateForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Ordens de Serviço</h1>
        <div className="controls-container">
          <div className="file-input-container">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Carregar CSV
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            {file && <span className="file-name">{file.name}</span>}
          </div>
          {loading && <p>Carregando...</p>}
          <div className="actions-row">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? (
                            <FontAwesomeIcon icon={faSortUp} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSortDown} className="sort-icon" />
                          )
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                          ref={el => filterButtonRefs.current[header] = el} // Adiciona a ref para o botão
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
                            : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
